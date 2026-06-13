#!/usr/bin/env python3
"""Minimal password-SSH runner for the staging VPS deploy.

Reads host/user/password from environment so no secret is written to disk:
  VPS_HOST, VPS_USER, VPS_PASS

Usage:
  py -3 scripts/vps-ssh.py "remote command"
  py -3 scripts/vps-ssh.py --put localfile remotepath
"""
import os
import sys
import time
import socket
import paramiko


def connect():
    host = os.environ["VPS_HOST"]
    user = os.environ.get("VPS_USER", "root")
    password = os.environ["VPS_PASS"]
    last_err = None
    for attempt in range(1, 7):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                host,
                username=user,
                password=password,
                timeout=45,
                banner_timeout=45,
                auth_timeout=45,
                look_for_keys=False,
                allow_agent=False,
            )
            return client
        except (socket.timeout, TimeoutError, paramiko.SSHException, OSError) as err:
            last_err = err
            sys.stderr.write(f"[vps-ssh] connect attempt {attempt} failed: {err}; retrying...\n")
            sys.stderr.flush()
            time.sleep(min(5 * attempt, 20))
    raise SystemExit(f"[vps-ssh] could not connect after retries: {last_err}")


def _write(stream, text):
    if not text:
        return
    data = text.encode("utf-8", "replace")
    buf = getattr(stream, "buffer", None)
    if buf is not None:
        buf.write(data)
        buf.flush()
    else:
        stream.write(text)


def run(client, command):
    stdin, stdout, stderr = client.exec_command(command, timeout=3600, get_pty=False)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    _write(sys.stdout, out)
    _write(sys.stderr, err)
    return code


def _open_sftp():
    client = connect()
    return client, client.open_sftp()


def put(client, local, remote):
    """Resumable upload that survives mid-transfer connection drops.

    The flaky link to the VPS frequently kills large SFTP transfers partway.
    Instead of restarting the whole 200MB each time, reconnect on failure and
    continue appending from the remote file's current size.
    """
    total = os.path.getsize(local)
    block = 1024 * 256  # 256 KB writes keep progress moving on a lossy link
    last_bucket = -1
    # We manage our own connection here so a drop can be retried independently
    # of the initial connect() in main().
    try:
        client.close()
    except Exception:
        pass

    attempts = 0
    while True:
        attempts += 1
        cli = None
        try:
            cli, sftp = _open_sftp()
            try:
                offset = sftp.stat(remote).st_size
            except IOError:
                offset = 0
            if offset > total:
                offset = 0  # remote larger than source: stale file, start over
            mode = "ab" if offset > 0 else "wb"
            with open(local, "rb") as fh:
                fh.seek(offset)
                with sftp.open(remote, mode) as rf:
                    rf.set_pipelined(True)
                    done = offset
                    if offset > 0:
                        sys.stdout.write(f"\rresuming from {offset}/{total} bytes\n")
                        sys.stdout.flush()
                    while True:
                        data = fh.read(block)
                        if not data:
                            break
                        rf.write(data)
                        done += len(data)
                        bucket = int((done / total * 100) // 2) if total else 0
                        if bucket != last_bucket:
                            last_bucket = bucket
                            sys.stdout.write(f"\rupload {done / total * 100:5.1f}% ({done}/{total} bytes)")
                            sys.stdout.flush()
            # Verify the full size landed before declaring success.
            final = sftp.stat(remote).st_size
            sftp.close()
            cli.close()
            if final == total:
                sys.stdout.write(f"\nupload complete ({final}/{total} bytes)\n")
                return 0
            sys.stderr.write(f"\n[vps-ssh] size mismatch {final}/{total}, retrying...\n")
        except (socket.timeout, TimeoutError, paramiko.SSHException, EOFError, OSError) as err:
            sys.stderr.write(f"\n[vps-ssh] upload interrupted (attempt {attempts}): {err}; resuming...\n")
            sys.stderr.flush()
            try:
                if cli:
                    cli.close()
            except Exception:
                pass
            if attempts >= 40:
                raise SystemExit(f"[vps-ssh] upload failed after {attempts} attempts: {err}")
            time.sleep(min(5 + attempts, 25))


def main():
    args = sys.argv[1:]
    if not args:
        print("usage: vps-ssh.py <command> | --put <local> <remote>", file=sys.stderr)
        return 2
    client = connect()
    try:
        if args[0] == "--put":
            return put(client, args[1], args[2])
        return run(client, args[0])
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
