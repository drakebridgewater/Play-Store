// The apps on the home screen, in order. Setup is reached from the ⚙️ button, not a tile.
// Setup → Home screen can hide any of these (saved on the server as hub.hidden).
export const APPS = [
  { id: 'store', name: 'Store', emoji: '🏪', color: '#ff7a45', href: '#/store' },
  { id: 'bank', name: 'Bank', emoji: '🏦', color: '#0f766e', href: '#/bank' },
  { id: 'people', name: 'People', emoji: '🙂', color: '#9333ea', href: '#/people' },
  { id: 'spy', name: 'Spy HQ', emoji: '🕵️', color: '#1e293b', href: '#/spy' },
  { id: 'scanner', name: 'Scanner', emoji: '🔍', color: '#0891b2', href: '#/scanner', app: 'tools' },
  { id: 'qr', name: 'QR Studio', emoji: '🔳', color: '#475569', href: '#/qr', app: 'tools' },
  { id: 'calc', name: 'Adding Machine', emoji: '🧮', color: '#ca8a04', href: '#/calc', app: 'tools' },
];
