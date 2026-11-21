'use strict';
// Starter stores. Prices are in cents.

const TEMPLATES = {
  coffee: {
    label: 'Coffee Shop', name: 'Coffee Shop', emoji: '☕', color: '#9a5b34',
    categories: [
      ['Hot drinks', '☕', [['Hot cocoa', '🍫', 200], ['Coffee', '☕', 200], ['Tea', '🍵', 150]]],
      ['Cold drinks', '🧋', [['Lemonade', '🍋', 100], ['Smoothie', '🥤', 300], ['Milk', '🥛', 100]]],
      ['Treats', '🍪', [['Cookie', '🍪', 100], ['Cupcake', '🧁', 200], ['Donut', '🍩', 150], ['Croissant', '🥐', 200]]],
    ],
  },
  sandwich: {
    label: 'Sandwich Shop', name: 'Sandwich Shop', emoji: '🥪', color: '#d97706',
    categories: [
      ['Sandwiches', '🥪', [['PB & J', '🥜', 300], ['Grilled cheese', '🧀', 350], ['Ham & cheese', '🥪', 400], ['Turkey', '🦃', 400]]],
      ['Sides', '🍎', [['Apple slices', '🍎', 100], ['Chips', '🥔', 100], ['Carrots', '🥕', 100], ['Pickle', '🥒', 50]]],
      ['Drinks', '🧃', [['Juice box', '🧃', 100], ['Water', '💧', 50], ['Milk', '🥛', 100]]],
    ],
  },
  tech: {
    label: 'Tech Store', name: 'Tech Store', emoji: '💻', color: '#2563eb',
    categories: [
      ['Gadgets', '📱', [['Phone', '📱', 2000], ['Laptop', '💻', 5000], ['Headphones', '🎧', 1000], ['Game controller', '🎮', 1500], ['Camera', '📷', 2500]]],
      ['Accessories', '🔌', [['Batteries', '🔋', 200], ['Cable', '🔌', 300], ['Mouse', '🖱️', 500], ['Keyboard', '⌨️', 800]]],
      ['Services', '🔧', [['Repair', '🔧', 500], ['Setup help', '🛠️', 300]]],
    ],
  },
  myshop: {
    label: 'My Own Shop', name: 'My Shop', emoji: '⭐', color: '#db2777',
    categories: [['My Stuff', '⭐', []]],
  },
  blank: {
    label: 'Blank', name: 'New Store', emoji: '🏪', color: '#16a34a',
    categories: [['Items', '🏷️', []]],
  },
};

function makeStore(key, newId) {
  const t = TEMPLATES[key] || TEMPLATES.blank;
  const store = {
    id: newId(), name: t.name, emoji: t.emoji, color: t.color,
    taxRate: 0, playMoney: true, categories: [], items: [],
  };
  for (const [name, emoji, items] of t.categories) {
    const cat = { id: newId(), name, emoji };
    store.categories.push(cat);
    for (const [iname, iemoji, price] of items) {
      store.items.push({ id: newId(), categoryId: cat.id, name: iname, emoji: iemoji, photo: null, price, addedBy: 'grownup' });
    }
  }
  return store;
}

const templateList = () => Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, emoji: t.emoji, color: t.color }));

module.exports = { makeStore, templateList };
