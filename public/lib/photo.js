// Take or pick a photo and shrink it to a small square JPEG.

export function readFile(capture) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (capture) inp.setAttribute('capture', 'environment');
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

// fit 'cover' (camera photos) crops the middle square; 'contain' fits the whole picture on white.
export async function shrinkPhoto(file, { fit = 'cover' } = {}) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
  }
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (fit === 'contain') {
    const size = Math.min(480, Math.max(w, h)), k = size / Math.max(w, h);
    c.width = c.height = size;
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.drawImage(img, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
  } else {
    const side = Math.min(w, h), size = Math.min(480, side);
    c.width = c.height = size;
    g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  }
  return c.toDataURL('image/jpeg', 0.82);
}
