const KHMER_DIGITS = ["សូន្យ", "មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ", "ប្រាំពីរ", "ប្រាំបី", "ប្រាំបួន"];

const KHMER_TENS = [
  "",
  "ដប់",
  "ម្ភៃ",
  "សាមសិប",
  "សែសិប",
  "ហាសិប",
  "ហុកសិប",
  "ចិតសិប",
  "ប៉ែតសិប",
  "កៅសិប"
];

const KHMER_UNITS = [
  { value: 10000000, name: "កោដិ" },
  { value: 1000000, name: "លាន" },
  { value: 100000, name: "សែន" },
  { value: 10000, name: "ម៉ឺន" },
  { value: 1000, name: "ពាន់" },
  { value: 100, name: "រយ" }
];

const KHMER_MONTHS = [
  "",
  "មករា",
  "កុម្ភៈ",
  "មីនា",
  "មេសា",
  "ឧសភា",
  "មិថុនា",
  "កក្កដា",
  "សីហា",
  "កញ្ញា",
  "តុលា",
  "វិច្ឆិកា",
  "ធ្នូ"
];

const KHMER_DIGIT_MAP: Record<string, string> = {
  "០": "0",
  "១": "1",
  "២": "2",
  "៣": "3",
  "៤": "4",
  "៥": "5",
  "៦": "6",
  "៧": "7",
  "៨": "8",
  "៩": "9"
};

function normalizeKhmerDigits(text: string): string {
  return text.replace(/[០-៩]/g, (char) => KHMER_DIGIT_MAP[char] ?? char);
}

export function integerToKhmerWords(num: number): string {
  if (num === 0) return "សូន្យ";
  if (num < 0) return "ដក" + integerToKhmerWords(Math.abs(num));

  let result = "";
  let remaining = num;

  for (const unit of KHMER_UNITS) {
    const count = Math.floor(remaining / unit.value);
    if (count > 0) {
      result += integerToKhmerWords(count) + unit.name;
      remaining %= unit.value;
    }
  }

  if (remaining > 0) {
    if (remaining < 10) {
      result += KHMER_DIGITS[remaining];
    } else {
      const tens = Math.floor(remaining / 10);
      const units = remaining % 10;
      result += KHMER_TENS[tens];
      if (units > 0) {
        result += KHMER_DIGITS[units];
      }
    }
  }

  return result;
}

export function numberToKhmerWords(num: number | string): string {
  const str = num.toString().replace(/,/g, "");

  if (str.startsWith("-")) {
    return "ដក" + numberToKhmerWords(str.slice(1));
  }

  const parts = str.split(".");
  const integerPartVal = parseInt(parts[0], 10);
  const intWords = integerToKhmerWords(integerPartVal);

  if (parts.length === 1) {
    return intWords;
  }

  const decimalPart = parts[1];
  let decWords = "";
  for (let i = 0; i < decimalPart.length; i++) {
    const digit = parseInt(decimalPart[i], 10);
    decWords += KHMER_DIGITS[digit];
  }

  return `${intWords}ក្បៀស${decWords}`;
}

function replacePhoneNumbers(text: string): string {
  return text.replace(/(?:\+855|0)\s*(?:\d\s*[-()]?\s*){7,11}\d/g, (match) => {
    let normalized = match.replace(/[^\d+]/g, "");
    let result = "";
    if (normalized.startsWith("+855")) {
      result += "បូកប្រាំបីប្រាំប្រាំ ";
      normalized = normalized.slice(4);
    }
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (char === "0") result += "សូន្យ";
      else if (char === "1") result += "មួយ";
      else if (char === "2") result += "ពីរ";
      else if (char === "3") result += "បី";
      else if (char === "4") result += "បួន";
      else if (char === "5") result += "ប្រាំ";
      else if (char === "6") result += "ប្រាំមួយ";
      else if (char === "7") result += "ប្រាំពីរ";
      else if (char === "8") result += "ប្រាំបី";
      else if (char === "9") result += "ប្រាំបួន";

      if (i < normalized.length - 1) {
        result += " ";
      }
    }
    return result;
  });
}

function replaceDates(text: string): string {
  return text.replace(/(?:ថ្ងៃទី\s*)?(\d{1,2})[-/](\d{1,2})[-/](\d{4})/g, (match, dStr, mStr, yStr) => {
    const day = parseInt(dStr, 10);
    const month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const dayWords = integerToKhmerWords(day);
      const monthWords = KHMER_MONTHS[month];
      const yearWords = integerToKhmerWords(year);
      return `ថ្ងៃទី${dayWords} ខែ${monthWords} ឆ្នាំ${yearWords}`;
    }
    return match;
  });
}

function replaceYears(text: string): string {
  return text.replace(/ឆ្នាំ\s*(\d{4})\b/g, (match, yStr) => {
    const year = parseInt(yStr, 10);
    return `ឆ្នាំ${integerToKhmerWords(year)}`;
  });
}

function replaceCurrencies(text: string): string {
  let result = text.replace(/\$\s*(\d+(?:,\d+)*(?:\.\d+)?)\b/g, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}ដុល្លារ`;
  });

  result = result.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:\$|USD\b|ដុល្លារ)/g, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}ដុល្លារ`;
  });

  result = result.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:៛|riel\b|រៀល)/gi, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}រៀល`;
  });

  return result;
}

function replacePercentages(text: string): string {
  return text.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*%/g, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}ភាគរយ`;
  });
}

function replaceUnits(text: string): string {
  let result = text.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:°C|C\b|អង្សាសេ)/g, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}អង្សាសេ`;
  });

  result = result.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:kg\b|គីឡូក្រាម)/gi, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}គីឡូក្រាម`;
  });

  result = result.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:km\b|គីឡូម៉ែត្រ)/gi, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}គីឡូម៉ែត្រ`;
  });

  result = result.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:cm\b|សង់ទីម៉ែត្រ)/gi, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}សង់ទីម៉ែត្រ`;
  });

  result = result.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:m\b|ម៉ែត្រ)/gi, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}ម៉ែត្រ`;
  });

  result = result.replace(/\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:g\b|ក្រាម)/gi, (match, numStr) => {
    return `${numberToKhmerWords(numStr)}ក្រាម`;
  });

  return result;
}

function replaceStandaloneNumbers(text: string): string {
  return text.replace(/(?:-\s*)?\b\d+(?:,\d+)*(?:\.\d+)?\b/g, (match) => {
    const cleaned = match.replace(/\s+/g, "");
    return numberToKhmerWords(cleaned);
  });
}

export function normalizeText(text: string): string {
  if (!text) return text;

  let normalized = normalizeKhmerDigits(text);

  normalized = replacePhoneNumbers(normalized);
  normalized = replaceDates(normalized);
  normalized = replaceYears(normalized);
  normalized = replaceCurrencies(normalized);
  normalized = replacePercentages(normalized);
  normalized = replaceUnits(normalized);
  normalized = replaceStandaloneNumbers(normalized);

  return normalized;
}
