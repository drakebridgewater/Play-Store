// Barcode facts for the Scanner app: which country's GS1 office gave out a product barcode's
// prefix (where the company signed up, not always where it was made), and the check-digit math.

// [from, to, name, flag] for the first 3 digits of an EAN-13 (UPC-A gets a 0 in front).
const RANGES = [
  [0, 19, 'the USA or Canada', '🇺🇸🇨🇦'], [20, 29, 'a store’s own label', '🏷️'], [30, 39, 'the USA (medicine)', '🇺🇸'], [40, 49, 'a store’s own label', '🏷️'],
  [50, 59, 'a coupon', '🎟️'], [60, 139, 'the USA or Canada', '🇺🇸🇨🇦'], [200, 299, 'a store’s own label', '🏷️'], [300, 379, 'France', '🇫🇷'],
  [380, 380, 'Bulgaria', '🇧🇬'], [383, 383, 'Slovenia', '🇸🇮'], [385, 385, 'Croatia', '🇭🇷'], [387, 387, 'Bosnia and Herzegovina', '🇧🇦'],
  [400, 440, 'Germany', '🇩🇪'], [450, 459, 'Japan', '🇯🇵'], [460, 469, 'Russia', '🇷🇺'], [471, 471, 'Taiwan', '🇹🇼'], [474, 474, 'Estonia', '🇪🇪'],
  [475, 475, 'Latvia', '🇱🇻'], [477, 477, 'Lithuania', '🇱🇹'], [479, 479, 'Sri Lanka', '🇱🇰'], [480, 480, 'the Philippines', '🇵🇭'], [482, 482, 'Ukraine', '🇺🇦'],
  [489, 489, 'Hong Kong', '🇭🇰'], [490, 499, 'Japan', '🇯🇵'], [500, 509, 'the United Kingdom', '🇬🇧'], [520, 521, 'Greece', '🇬🇷'], [528, 528, 'Lebanon', '🇱🇧'],
  [529, 529, 'Cyprus', '🇨🇾'], [535, 535, 'Malta', '🇲🇹'], [539, 539, 'Ireland', '🇮🇪'], [540, 549, 'Belgium or Luxembourg', '🇧🇪🇱🇺'], [560, 560, 'Portugal', '🇵🇹'],
  [569, 569, 'Iceland', '🇮🇸'], [570, 579, 'Denmark', '🇩🇰'], [590, 590, 'Poland', '🇵🇱'], [594, 594, 'Romania', '🇷🇴'], [599, 599, 'Hungary', '🇭🇺'],
  [600, 601, 'South Africa', '🇿🇦'], [611, 611, 'Morocco', '🇲🇦'], [616, 616, 'Kenya', '🇰🇪'], [622, 622, 'Egypt', '🇪🇬'], [628, 628, 'Saudi Arabia', '🇸🇦'],
  [629, 629, 'the United Arab Emirates', '🇦🇪'], [640, 649, 'Finland', '🇫🇮'], [690, 699, 'China', '🇨🇳'], [700, 709, 'Norway', '🇳🇴'], [729, 729, 'Israel', '🇮🇱'],
  [730, 739, 'Sweden', '🇸🇪'], [740, 740, 'Guatemala', '🇬🇹'], [744, 744, 'Costa Rica', '🇨🇷'], [750, 750, 'Mexico', '🇲🇽'], [754, 755, 'Canada', '🇨🇦'],
  [760, 769, 'Switzerland', '🇨🇭'], [770, 771, 'Colombia', '🇨🇴'], [773, 773, 'Uruguay', '🇺🇾'], [775, 775, 'Peru', '🇵🇪'], [778, 779, 'Argentina', '🇦🇷'],
  [780, 780, 'Chile', '🇨🇱'], [786, 786, 'Ecuador', '🇪🇨'], [789, 790, 'Brazil', '🇧🇷'], [800, 839, 'Italy', '🇮🇹'], [840, 849, 'Spain', '🇪🇸'],
  [850, 850, 'Cuba', '🇨🇺'], [858, 858, 'Slovakia', '🇸🇰'], [859, 859, 'Czechia', '🇨🇿'], [860, 860, 'Serbia', '🇷🇸'], [868, 869, 'Turkey', '🇹🇷'],
  [870, 879, 'the Netherlands', '🇳🇱'], [880, 880, 'South Korea', '🇰🇷'], [885, 885, 'Thailand', '🇹🇭'], [888, 888, 'Singapore', '🇸🇬'], [890, 890, 'India', '🇮🇳'],
  [893, 893, 'Vietnam', '🇻🇳'], [896, 896, 'Pakistan', '🇵🇰'], [899, 899, 'Indonesia', '🇮🇩'], [900, 919, 'Austria', '🇦🇹'], [930, 939, 'Australia', '🇦🇺'],
  [940, 949, 'New Zealand', '🇳🇿'], [955, 955, 'Malaysia', '🇲🇾'], [958, 958, 'Macau', '🇲🇴'], [977, 977, 'a magazine', '📰'], [978, 979, 'a book (ISBN)', '📚'],
  [980, 980, 'a refund receipt', '🧾'], [981, 984, 'a coupon', '🎟️'], [990, 999, 'a coupon', '🎟️'],
];

// Where a product barcode's prefix comes from. Returns { name, flag, prefix } or null.
export function countryOf(digits) {
  if (!/^\d{12,13}$/.test(digits)) return null;
  const ean = digits.length === 12 ? `0${digits}` : digits;
  const prefix = Number(ean.slice(0, 3));
  const r = RANGES.find(([a, b]) => prefix >= a && prefix <= b);
  return r ? { name: r[2], flag: r[3], prefix: ean.slice(0, 3) } : { name: 'somewhere we don’t know yet', flag: '🌍', prefix: ean.slice(0, 3) };
}

// The check-digit detective: every digit but the last times 1 or 3, added up; the last digit is
// whatever gets the sum to the next multiple of 10.
export function checkSteps(digits) {
  const body = [...digits.slice(0, -1)].map(Number);
  // Weights run 3, 1, 3, 1… starting from the digit next to the check digit.
  const steps = body.map((d, i) => { const w = (body.length - 1 - i) % 2 === 0 ? 3 : 1; return { d, w, p: d * w }; });
  const sum = steps.reduce((a, s) => a + s.p, 0);
  const next = Math.ceil(sum / 10) * 10;
  const check = next - sum;
  return { steps, sum, next, check, last: Number(digits.at(-1)), ok: check === Number(digits.at(-1)) };
}
