// Saving a file the app made: a PDF, a Word or Excel file, a trip backup.
// On the web the browser downloads it. In the Android app a WebView cannot
// download a blob, so Android's share sheet opens instead: save it to Files
// or Drive, or send it on (AppToolsPlugin.java).
import { isNative } from './platform.js';
import { AppTools } from './native/appTools.js';

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function saveFile(blob, fileName) {
  if (isNative) {
    await AppTools.shareFile({
      fileName,
      base64: await toBase64(blob),
      mimeType: blob.type || 'application/octet-stream',
      title: fileName,
    });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
