// Local-first keyword categorization — instant, offline, zero AI cost.
// A trimmed port of the rules in lib/data/services/ai_categorize_service.dart;
// the backend /ai/categorize is the fallback for misses.
const KEYWORD_RULES: Record<string, string> = {};

function add(category: string, keywords: string[]) {
  for (const k of keywords) KEYWORD_RULES[k] = category;
}

add('Food', ['swiggy', 'zomato', 'restaurant', 'cafe', 'pizza', 'burger', 'biryani', 'dominos', 'mcdonald', 'kfc', 'starbucks', 'dinner', 'lunch', 'breakfast', 'hotel', 'dhaba', 'eat']);
add('Grocery', ['bigbasket', 'grofers', 'blinkit', 'zepto', 'dmart', 'grocery', 'supermarket', 'vegetables', 'milk', 'kirana', 'instamart']);
add('Transport', ['uber', 'ola', 'rapido', 'metro', 'bus', 'cab', 'taxi', 'auto', 'train', 'irctc']);
add('Entertainment', ['netflix', 'spotify', 'movie', 'cinema', 'pvr', 'inox', 'bookmyshow', 'prime video', 'hotstar', 'game']);
add('Shopping', ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'shopping', 'mall', 'store', 'nykaa']);
add('Bills', ['electricity', 'water bill', 'gas bill', 'broadband', 'recharge', 'postpaid', 'bill', 'dth']);
add('Health', ['gym', 'fitness', 'pharmacy', 'doctor', 'clinic', 'hospital', 'medicine', 'apollo', 'medplus']);
add('Fuel', ['petrol', 'diesel', 'fuel', 'hp', 'indian oil', 'bharat petroleum', 'shell']);
add('Travel', ['makemytrip', 'goibibo', 'flight', 'airbnb', 'oyo', 'booking', 'trip', 'vacation', 'indigo', 'vistara']);
add('Subscription', ['subscription', 'membership', 'renewal', 'icloud', 'youtube premium', 'adobe']);
add('Electronics', ['laptop', 'mobile', 'headphone', 'charger', 'electronics', 'gadget', 'croma', 'reliance digital']);
add('Fashion', ['clothing', 'shoes', 'apparel', 'fashion', 'zara', 'h&m', 'uniqlo']);
add('Rent', ['rent', 'lease', 'landlord']);
add('Investment', ['mutual fund', 'sip', 'stocks', 'zerodha', 'groww', 'investment', 'fd', 'nps']);
add('Education', ['course', 'udemy', 'coursera', 'tuition', 'school', 'college', 'books', 'fees']);

export function categorizeLocal(description: string): string | null {
  const text = (description || '').toLowerCase();
  if (!text.trim()) return null;
  for (const [keyword, category] of Object.entries(KEYWORD_RULES)) {
    if (text.includes(keyword)) return category;
  }
  return null;
}
