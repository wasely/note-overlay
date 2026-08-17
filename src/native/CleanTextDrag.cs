using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

internal static class CleanTextDrag
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputUnion Data;
    }

    // The union must declare every INPUT member so Marshal.SizeOf matches the
    // native INPUT size (40 bytes on x64). Declaring only KeyboardInput makes it
    // report 28 bytes and SendInput fails with 0 inputs sent.
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MouseInput Mouse;
        [FieldOffset(0)] public KeyboardInput Keyboard;
        [FieldOffset(0)] public HardwareInput Hardware;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int X;
        public int Y;
        public uint MouseData;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HardwareInput
    {
        public uint Message;
        public ushort WParamL;
        public ushort WParamH;
    }

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int virtualKey);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out Point point);

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(Point point);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr windowHandle, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint count, Input[] inputs, int size);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

    private const uint GaRoot = 2;
    private const uint Keyboard = 1;
    private const uint KeyUp = 0x0002;
    private const uint Unicode = 0x0004;
    private const uint MouseDown = 0x0002;
    private const uint MouseUp = 0x0004;

    private static void Log(string message)
    {
        var path = Environment.GetEnvironmentVariable("NOTEBOOK_CLEAN_DRAG_LOG");
        if (!string.IsNullOrEmpty(path)) File.AppendAllText(path, DateTime.UtcNow.ToString("O") + " " + message + Environment.NewLine);
    }

    private static bool WaitForDrop()
    {
        var signal = Environment.GetEnvironmentVariable("NOTEBOOK_CLEAN_DRAG_DROP_SIGNAL");
        if (!string.IsNullOrEmpty(signal))
        {
            var signalDeadline = DateTime.UtcNow.AddSeconds(10);
            while (!File.Exists(signal) && DateTime.UtcNow < signalDeadline) Thread.Sleep(10);
            return File.Exists(signal);
        }

        var pressDeadline = DateTime.UtcNow.AddSeconds(2);
        while ((GetAsyncKeyState(0x01) & 0x8000) == 0 && DateTime.UtcNow < pressDeadline) Thread.Sleep(5);
        if ((GetAsyncKeyState(0x01) & 0x8000) == 0) return false;
        var releaseDeadline = DateTime.UtcNow.AddSeconds(15);
        while ((GetAsyncKeyState(0x01) & 0x8000) != 0 && DateTime.UtcNow < releaseDeadline) Thread.Sleep(8);
        return (GetAsyncKeyState(0x01) & 0x8000) == 0;
    }

    // Test-only hook: the live drag test writes the target window's handle here so
    // it can type into a known window even when the desktop is cluttered with other
    // windows on top of the test's drop target.
    private static IntPtr TargetFromFile()
    {
        var path = Environment.GetEnvironmentVariable("NOTEBOOK_CLEAN_DRAG_TARGET_FILE");
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return IntPtr.Zero;
        try
        {
            long value;
            return long.TryParse(File.ReadAllText(path).Trim(), out value) ? new IntPtr(value) : IntPtr.Zero;
        }
        catch { return IntPtr.Zero; }
    }

    // A brief synthetic Alt press/release makes Windows treat this background
    // process as the last input source, which unlocks SetForegroundWindow.
    private static void GrantForegroundRights()
    {
        var inputs = new[]
        {
            new Input { Type = Keyboard, Data = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = 0x12, Flags = 0 } } },
            new Input { Type = Keyboard, Data = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = 0x12, Flags = KeyUp } } },
        };
        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
    }

    private static uint TypeUnicode(string text)
    {
        var inputs = new Input[text.Length * 2];
        for (var index = 0; index < text.Length; index++)
        {
            inputs[index * 2] = new Input { Type = Keyboard, Data = new InputUnion { Keyboard = new KeyboardInput { ScanCode = text[index], Flags = Unicode } } };
            inputs[index * 2 + 1] = new Input { Type = Keyboard, Data = new InputUnion { Keyboard = new KeyboardInput { ScanCode = text[index], Flags = Unicode | KeyUp } } };
        }
        return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
    }

    [STAThread]
    private static int Main(string[] args)
    {
        SetProcessDPIAware();
        if (args.Length == 2 && args[0] == "--probe") { Console.WriteLine(args[1]); return 0; }
        if (args.Length != 1 || string.IsNullOrWhiteSpace(args[0])) return 2;

        Log("started " + args[0]);
        if (!WaitForDrop()) { Log("drop-timeout"); return 3; }

        Point point;
        if (!GetCursorPos(out point)) return 4;
        var target = WindowFromPoint(point);
        var root = GetAncestor(target, GaRoot);

        var forced = TargetFromFile();
        if (forced != IntPtr.Zero) { target = forced; root = forced; }

        Log("target=" + target + " root=" + root + " point=" + point.X + "," + point.Y);
        if (root == IntPtr.Zero) { Log("focus-failed"); return 5; }

        // Windows only lets the foreground process take focus. Attach our thread to
        // the current foreground thread first so SetForegroundWindow is allowed from
        // this detached background process.
        var fgBefore = GetForegroundWindow();
        uint fgProcessId;
        var fgThread = GetWindowThreadProcessId(fgBefore, out fgProcessId);
        var currentThread = GetCurrentThreadId();
        var attached = fgThread != 0 && fgThread != currentThread && AttachThreadInput(currentThread, fgThread, true);
        try
        {
            if (!SetForegroundWindow(root))
            {
                GrantForegroundRights();
                if (!SetForegroundWindow(root)) { Log("focus-failed"); return 5; }
            }
            Thread.Sleep(140);
            // The drop-signal path can leave the drag button held. Release it first
            // so the click below is a real click that focuses the target, not a drag-release.
            if ((GetAsyncKeyState(0x01) & 0x8000) != 0)
            {
                mouse_event(MouseUp, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(100);
            }
            mouse_event(MouseDown, 0, 0, 0, UIntPtr.Zero);
            mouse_event(MouseUp, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(100);
            var sent = TypeUnicode(args[0]);
            Log("sent=" + sent);
            return sent == args[0].Length * 2 ? 0 : 6;
        }
        finally
        {
            if (attached) AttachThreadInput(currentThread, fgThread, false);
        }
    }
}
