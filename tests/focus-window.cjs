const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
// Playwright's DOM focus is not Windows foreground focus. Click only the known
// test window's title bar, and verify its HWND before testing native input.
module.exports = async function focusWindow(handle) {
  if (!/^\d+$/.test(String(handle))) throw Error('Invalid test window');
  const code = `Add-Type @'
using System; using System.Runtime.InteropServices;
public class TestFocus {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x,int y,int w,int hgt,uint f);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$h=[IntPtr]([long]${handle}); $rect=New-Object TestFocus+Rect
try {
 [void][TestFocus]::SetWindowPos($h,[IntPtr](-1),0,0,0,0,3)
 [void][TestFocus]::GetWindowRect($h,[ref]$rect)
 [void][TestFocus]::SetCursorPos($rect.left+100,$rect.top+12)
 [TestFocus]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [TestFocus]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 200
 if ([TestFocus]::GetForegroundWindow() -ne $h) { throw 'Test window is not the Windows foreground window' }
} finally { [void][TestFocus]::SetWindowPos($h,[IntPtr](-2),0,0,0,0,3) }`;
  await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000 });
};
