'use strict';
// Starter stores. Prices are in cents. Items: { name, emoji, icon?, price?, wasPrice?, builder?, recipe? }.
// Builder items price themselves from their recipe (see public/art.js).
const Art = require('./public/art.js');

const build = (name, emoji, builder) => ({ name, emoji, builder });
const preset = (name, emoji, builder, recipe) => ({ name, emoji, builder, recipe });
const thing = (name, emoji, icon, price, wasPrice) => ({ name, emoji, icon, price, wasPrice });

const TEMPLATES = {
  coffee: {
    label: 'Coffee Shop', name: 'Coffee Shop', emoji: '☕', color: '#9a5b34',
    categories: [
      ['Coffee bar', '☕', [
        build('Make a drink', '☕', 'drink'),
        preset('Caffè Latte', '☕', 'drink', { size: 'm', layers: ['espresso', 'milk', 'milk', 'milk', 'foam'] }),
        preset('Cappuccino', '☕', 'drink', { size: 's', layers: ['espresso', 'milk', 'foam', 'foam'] }),
        preset('Caffè Mocha', '☕', 'drink', { size: 'm', layers: ['chocolate', 'espresso', 'milk', 'milk'], toppings: ['whip'] }),
        preset('Hot Cocoa', '🍫', 'drink', { size: 'm', layers: ['chocolate', 'milk', 'milk', 'milk'], toppings: ['marshmallows'] }),
        preset('Iced Caramel Latte', '🧋', 'drink', { size: 'l', iced: true, layers: ['caramel', 'espresso', 'milk', 'milk', 'milk'] }),
        preset('Tea', '🍵', 'drink', { size: 's', layers: ['tea', 'tea', 'tea', 'tea'] }),
      ]],
      ['Cold drinks', '🧋', [thing('Lemonade', '🍋', 'lemonade', 100), thing('Smoothie', '🥤', 'smoothie', 300), thing('Milk', '🥛', 'milk', 100)]],
      ['Treats', '🍪', [thing('Cookie', '🍪', 'cookie', 100), thing('Cupcake', '🧁', 'cupcake', 200), thing('Donut', '🍩', 'donut', 150),
        thing('Croissant', '🥐', 'croissant', 200), thing('Muffin', '🧁', 'muffin', 150)]],
    ],
  },
  sandwich: {
    label: 'Sandwich Shop', name: 'Sandwich Shop', emoji: '🥪', color: '#d97706',
    categories: [
      ['Sandwiches', '🥪', [
        build('Build a sandwich', '🥪', 'sandwich'),
        preset('Grilled Cheese', '🧀', 'sandwich', { bread: 'white', layers: ['cheese', 'cheese'], toasted: true }),
        preset('PB & J', '🥜', 'sandwich', { bread: 'white', layers: ['pb', 'jelly'] }),
        preset('Ham & Cheese', '🥪', 'sandwich', { bread: 'brown', layers: ['mustard', 'ham', 'whitecheese', 'lettuce'] }),
        preset('Turkey Club', '🦃', 'sandwich', { bread: 'white', layers: ['mayo', 'lettuce', 'tomato', 'bacon', 'turkey'], toasted: true }),
      ]],
      ['Sides', '🍎', [thing('Apple slices', '🍎', 'apple', 100), thing('Chips', '🥔', 'chips', 100), thing('Carrots', '🥕', 'carrot', 100), thing('Pickle', '🥒', 'pickle', 50)]],
      ['Drinks', '🧃', [thing('Juice box', '🧃', 'juicebox', 100), thing('Water', '💧', 'water', 50), thing('Milk', '🥛', 'milk', 100)]],
    ],
  },
  tech: {
    label: 'Tech Store', name: 'Tech Store', emoji: '📺', color: '#1e3a8a', theme: 'electronics',
    categories: [
      ['TVs', '📺', [thing('Giant TV', '📺', 'tv', 4999, 5999), thing('Soundbar', '🔊', 'soundbar', 1999)]],
      ['Computers', '💻', [thing('Laptop', '💻', 'laptop', 3999), thing('Desktop computer', '🖥️', 'desktop', 4499, 4999),
        thing('Keyboard', '⌨️', 'keyboard', 899), thing('Mouse', '🖱️', 'mouse', 499)]],
      ['Phones & Tablets', '📱', [thing('Phone', '📱', 'phone', 2999, 3499), thing('Tablet', '📱', 'tablet', 2499), thing('Smartwatch', '⌚', 'watch', 1499)]],
      ['Video Games', '🎮', [thing('Game console', '🎮', 'console', 3999), thing('Controller', '🎮', 'controller', 999, 1299),
        thing('Video game', '👾', 'game', 599), thing('VR headset', '🥽', 'vr', 2999)]],
      ['Audio', '🎧', [thing('Headphones', '🎧', 'headphones', 1299), thing('Earbuds', '🎧', 'earbuds', 999, 1199), thing('Speaker', '🔊', 'speaker', 799)]],
      ['Cameras & Drones', '📷', [thing('Camera', '📷', 'camera', 2499), thing('Drone', '🚁', 'drone', 3499, 3999)]],
      ['Accessories', '🔌', [thing('Charger', '🔌', 'charger', 299), thing('Batteries', '🔋', 'batteries', 199)]],
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

function makeItem(t, categoryId, newId) {
  const item = {
    id: newId(), categoryId, name: t.name, emoji: t.emoji, icon: t.icon || null, photo: null,
    price: t.price || 0, wasPrice: t.wasPrice || null, builder: t.builder || null, recipe: null, addedBy: 'grownup',
  };
  if (t.builder) {
    item.recipe = t.recipe ? Art.normRecipe(t.builder, t.recipe) : null;
    item.price = item.recipe ? Art.priceOf(t.builder, item.recipe) : Art.startPrice(t.builder);
  }
  return item;
}

function makeStore(key, newId) {
  const t = TEMPLATES[key] || TEMPLATES.blank;
  const store = {
    id: newId(), name: t.name, emoji: t.emoji, color: t.color, theme: t.theme || 'plain',
    taxRate: 0, playMoney: true, categories: [], items: [],
  };
  for (const [name, emoji, items] of t.categories) {
    const cat = { id: newId(), name, emoji };
    store.categories.push(cat);
    for (const it of items) store.items.push(makeItem(it, cat.id, newId));
  }
  return store;
}

const hasTemplate = (key) => Object.prototype.hasOwnProperty.call(TEMPLATES, key);
const templateList = () => Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, emoji: t.emoji, color: t.color }));

module.exports = { makeStore, templateList, hasTemplate };
