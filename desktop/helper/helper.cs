// Shono's one Windows helper. It replaces four PowerShell processes (~330 MB of memory, a 25-times-a-second
// media poll) with one small process. Built by compile.mjs with the C# compiler that ships with Windows' .NET
// Framework, so it's C# 5 (no $"" strings or ?.), and nothing new to install.
//   stdout: "full 0|1"  something runs full screen (Windows' "user notification state" 2 or 3), every 3 s
//           "pc 0|1"    Windows has the earbuds connected (for sound), every 3 s
//           "vol N"     Windows' volume (percent) when it changes, while taps are on (Windows calls back: no polling)
//           "kept S"    a doubled play/pause was undone (S: the state kept)
//           "settings"  Windows' Settings app came to the front (2026-11-23: the user sees it open by itself;
//                       Shono logs it next to its own connection events to find out why)
//   stdin:  "keys N"    press Windows' volume up (N > 0) or down |N| times
//           "taps 1|0"  watch for doubled play/pause and report the volume (while the earbuds are connected)
// It exits when Shono closes its stdin, so it can never outlive the app.
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Windows.Media.Control;

static class Helper {
  static readonly object OutLock = new object();
  static void Say(string line) {
    lock (OutLock) {
      Console.Out.WriteLine(line);
      Console.Out.Flush();
    }
  }

  static void Main(string[] args) {
    string prefix = args.Length > 0 ? args[0] : "HOCO EQ35";
    var commands = new Thread(ReadCommands);
    commands.IsBackground = true;
    commands.Start();
    var front = new Thread(WatchFront);
    front.IsBackground = true;
    front.Start();
    int full = -1, pc = -1;
    while (true) {
      int state;
      int f = SHQueryUserNotificationState(out state) == 0 && (state == 2 || state == 3) ? 1 : 0;
      if (f != full) Say("full " + (full = f));
      int c;
      try { c = EarbudsConnected(prefix) ? 1 : 0; } catch { c = 0; }
      if (c != pc) Say("pc " + (pc = c));
      if (tapsOn) FollowOutput(); // the default output can change (Speakers, Headphones)
      Thread.Sleep(3000);
    }
  }

  static void ReadCommands() {
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      try {
        if (line.StartsWith("keys ")) PressVolumeKeys(int.Parse(line.Substring(5)));
        else if (line == "taps 1") StartTaps();
        else if (line == "taps 0") StopTaps();
      } catch (Exception e) {
        Say("error " + e.Message.Replace('\n', ' '));
      }
    }
    Environment.Exit(0);
  }

  // ---- Windows' Settings app coming to the front: checked once a second, the window's process looked up only when
  // the front window changes ----
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);

  static void WatchFront() {
    IntPtr last = IntPtr.Zero;
    bool was = false;
    while (true) {
      Thread.Sleep(1000);
      IntPtr h = GetForegroundWindow();
      if (h == last) continue;
      last = h;
      bool now = IsSettings(h);
      if (now && !was) Say("settings");
      was = now;
    }
  }

  static bool IsSettings(IntPtr h) {
    if (h == IntPtr.Zero) return false;
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    string name;
    try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { return false; }
    if (name == "SystemSettings") return true;
    if (name != "ApplicationFrameHost") return false; // the frame Windows draws around Settings
    var title = new StringBuilder(64);
    GetWindowText(h, title, title.Capacity);
    return title.ToString() == "Settings";
  }

  // ---- full screen ----
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);

  // ---- volume keys: the earbuds' volume taps, passed on so Windows changes and shows its volume ----
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, int flags, IntPtr extra);
  static void PressVolumeKeys(int n) {
    byte key = n > 0 ? (byte)0xAF : (byte)0xAE;
    for (int i = 0; i < Math.Min(Math.Abs(n), 30); i++) {
      keybd_event(key, 0, 0, IntPtr.Zero);
      keybd_event(key, 0, 2, IntPtr.Zero);
    }
  }

  // ---- whether Windows has the earbuds connected: Windows' own list of known devices, no scanning ----
  [StructLayout(LayoutKind.Sequential)]
  struct SearchParams {
    public int dwSize, fReturnAuthenticated, fReturnRemembered, fReturnUnknown, fReturnConnected, fIssueInquiry;
    public byte cTimeoutMultiplier;
    public IntPtr hRadio;
  }
  [StructLayout(LayoutKind.Sequential)] struct SystemTime { public ushort y, m, dow, d, h, min, s, ms; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct DeviceInfo {
    public int dwSize;
    public ulong Address;
    public uint ulClassofDevice;
    public int fConnected, fRemembered, fAuthenticated;
    public SystemTime stLastSeen, stLastUsed;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)] public string szName;
  }
  [DllImport("bthprops.cpl")] static extern IntPtr BluetoothFindFirstDevice(ref SearchParams p, ref DeviceInfo info);
  [DllImport("bthprops.cpl")] static extern bool BluetoothFindNextDevice(IntPtr find, ref DeviceInfo info);
  [DllImport("bthprops.cpl")] static extern bool BluetoothFindDeviceClose(IntPtr find);

  static bool EarbudsConnected(string prefix) {
    var p = new SearchParams();
    p.dwSize = Marshal.SizeOf(typeof(SearchParams));
    p.fReturnAuthenticated = 1;
    p.fReturnRemembered = 1;
    p.fReturnConnected = 1;
    var info = new DeviceInfo();
    info.dwSize = Marshal.SizeOf(typeof(DeviceInfo));
    IntPtr find = BluetoothFindFirstDevice(ref p, ref info);
    if (find == IntPtr.Zero) return false;
    try {
      do {
        if (info.fConnected != 0 && info.szName != null && info.szName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return true;
        info.dwSize = Marshal.SizeOf(typeof(DeviceInfo));
      } while (BluetoothFindNextDevice(find, ref info));
    } finally {
      BluetoothFindDeviceClose(find);
    }
    return false;
  }

  // ---- media taps: each earbud play/pause tap is acted on twice by Windows (paused, then played again ~0.2 s
  // later). A flip that flips back within 450 ms is put back. Windows reports each change, so nothing is polled. ----
  static readonly object TapLock = new object();
  static GlobalSystemMediaTransportControlsSessionManager manager;
  static GlobalSystemMediaTransportControlsSession session;
  static bool tapsOn;
  static string app, last, before;
  static DateTime flippedAt = DateTime.MinValue, quietUntil = DateTime.MinValue;
  static int volume = -1;

  static void StartTaps() {
    lock (TapLock) {
      if (tapsOn) return;
      tapsOn = true;
      if (manager == null) {
        // waited for by hand: AsTask() needs the Windows SDK's single Windows.winmd, and only the per-area ones ship
        var request = GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        while (request.Status == Windows.Foundation.AsyncStatus.Started) Thread.Sleep(10);
        manager = request.GetResults();
        manager.CurrentSessionChanged += (m, e) => Follow(m.GetCurrentSession());
      }
      Follow(manager.GetCurrentSession());
      volume = -1;
      FollowOutput();
    }
  }

  static void StopTaps() {
    lock (TapLock) {
      tapsOn = false;
      Follow(null);
      FollowOutput();
    }
  }

  static void Follow(GlobalSystemMediaTransportControlsSession next) {
    lock (TapLock) {
      if (session != null) session.PlaybackInfoChanged -= OnPlayback;
      session = tapsOn ? next : null;
      last = null;
      before = null;
      if (session == null) return;
      app = session.SourceAppUserModelId;
      session.PlaybackInfoChanged += OnPlayback;
      Seen(session);
    }
  }

  static void OnPlayback(GlobalSystemMediaTransportControlsSession s, PlaybackInfoChangedEventArgs e) {
    lock (TapLock) {
      if (s == session) Seen(s);
    }
  }

  static void Seen(GlobalSystemMediaTransportControlsSession s) {
    string st;
    try { st = s.GetPlaybackInfo().PlaybackStatus.ToString(); } catch { last = null; return; }
    if (st != "Playing" && st != "Paused") return;
    DateTime now = DateTime.Now;
    if (last == null || st == last || now < quietUntil) {
      last = st;
      return;
    }
    if (st == before && (now - flippedAt).TotalMilliseconds < 450) {
      var put = last == "Paused" ? s.TryPauseAsync() : s.TryPlayAsync(); // not waited for
      GC.KeepAlive(put);
      Say("kept " + last);
      quietUntil = now.AddMilliseconds(700);
      before = null;
      last = st;
      return;
    }
    before = last;
    last = st;
    flippedAt = now;
  }

  // ---- Windows' volume: the default output tells Shono when it changes (it was read 4 times a second, which
  // built the audio objects anew each time: ~1% of a core) ----
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator { }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice dev); }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IDevice {
    [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    int NotImpl1();
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IVolumeCallback cb);
    [PreserveSig] int UnregisterControlChangeNotify(IVolumeCallback cb);
    int f3(); int f4(); int f5(); int f6();
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
  }
  static readonly VolumeCallback callback = new VolumeCallback();
  static IEndpointVolume output; // the default output being listened to
  static string outputId;

  /** Listens to the default output's volume while taps are on, and to nothing otherwise. */
  static void FollowOutput() {
    lock (TapLock) {
      try {
        string id = null;
        IEndpointVolume next = null;
        if (tapsOn) {
          var devices = (IDeviceEnumerator)new DeviceEnumerator();
          IDevice device;
          if (devices.GetDefaultAudioEndpoint(0, 1, out device) == 0) {
            device.GetId(out id);
            if (id != outputId) {
              Guid iid = typeof(IEndpointVolume).GUID;
              object o;
              if (device.Activate(ref iid, 23, IntPtr.Zero, out o) == 0) next = (IEndpointVolume)o;
            }
            Marshal.ReleaseComObject(device);
          }
          Marshal.ReleaseComObject(devices);
          if (id == outputId) return; // the same output: already listening
        }
        if (output != null) {
          output.UnregisterControlChangeNotify(callback);
          Marshal.ReleaseComObject(output);
        }
        output = next;
        outputId = next != null ? id : null;
        if (next == null) return;
        next.RegisterControlChangeNotify(callback);
        float level;
        if (next.GetMasterVolumeLevelScalar(out level) == 0) Report(level);
      } catch (Exception e) {
        Say("error volume: " + e.Message.Replace('\n', ' '));
      }
    }
  }

  internal static void Report(float level) {
    int v = (int)Math.Round(level * 100);
    lock (OutLock) {
      if (v == volume || !tapsOn) return;
      volume = v;
    }
    Say("vol " + v);
  }
}

// Windows calls this when the output's volume changes. Public, outside Helper: COM only calls into public types.
[Guid("657804FA-D6AD-4496-8A60-352752AF4F89"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVolumeCallback { [PreserveSig] int OnNotify(IntPtr data); }

public class VolumeCallback : IVolumeCallback {
  // AUDIO_VOLUME_NOTIFICATION_DATA: event context (16 bytes), muted (4), then the master volume (a float) at 20
  public int OnNotify(IntPtr data) {
    Helper.Report(BitConverter.ToSingle(BitConverter.GetBytes(Marshal.ReadInt32(data, 20)), 0));
    return 0;
  }
}
