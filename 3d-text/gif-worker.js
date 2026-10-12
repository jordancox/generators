// Runs gifski (single-threaded WebAssembly build) off the main thread so the
// page stays responsive while it works out the palettes and dithering.
import encode from './vendor/gifski/dist/encode.js';

self.onmessage = async (e) => {
  const { frames, width, height, fps, quality } = e.data;
  try {
    const gif = await encode({ frames, width, height, fps, quality });
    self.postMessage({ ok: true, gif }, [gif.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
