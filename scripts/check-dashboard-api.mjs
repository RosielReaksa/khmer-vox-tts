const apiKey = readFileSync("D:\\website api seller\\test-output\\seed-key.txt", "utf8").trim();

// Wait, this is for /api/v1/audio/speech, not the dashboard api. We need a session cookie.
// Let's just hit the dev server with the API key directly.
console.log("API key first 30 chars:", apiKey.substring(0, 30));
console.log("Testing /api/dashboard/api-data with this key...");

// Use the api key as bearer token
const resp = await fetch("http://localhost:3000/api/dashboard/api-data", {
  headers: { "Authorization": "Bearer " + apiKey }
});
console.log("Status:", resp.status);
console.log("Content-Type:", resp.headers.get("content-type"));
const body = await resp.text();
console.log("Body (first 500):", body.substring(0, 500));
