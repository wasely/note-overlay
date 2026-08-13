using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal static class CleanDragTestHost
{
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out Point point);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

    private const uint MouseDown = 0x0002;
    private const uint MouseUp = 0x0004;
    private const uint MouseMove = 0x0001;

    [STAThread]
    private static int Main(string[] args)
    {
        SetProcessDPIAware();
        if (args.Length == 6 && args[0] == "--receive") return Receive(args[1], args[2], args[3], int.Parse(args[4]), int.Parse(args[5]));
        if (args.Length == 5 && args[0] == "--drag") return Drag(args);
        if (args.Length == 3 && args[0] == "--move") { SetCursorPos(int.Parse(args[1]), int.Parse(args[2])); return 0; }
        if ((args.Length == 3 || args.Length == 4) && args[0] == "--finish") return Finish(int.Parse(args[1]), int.Parse(args[2]), args.Length == 4 ? args[3] : null);
        if (args.Length == 1 && args[0] == "--down") { mouse_event(MouseDown, 0, 0, 0, UIntPtr.Zero); return 0; }
        return 2;
    }

    private static int Receive(string readyPath, string resultPath, string expected, int x, int y)
    {
        Application.EnableVisualStyles();
        using (var form = new Form())
        {
            form.Text = "Notebook clean drag test";
            form.StartPosition = FormStartPosition.Manual;
            form.Bounds = new Rectangle(x, y, 440, 420);
            form.TopMost = true;
            var input = new TextBox { Dock = DockStyle.Fill, Multiline = true, Font = new Font("Consolas", 16), TextAlign = HorizontalAlignment.Center };
            input.TextChanged += (sender, eventArgs) =>
            {
                if (input.Text == expected) { File.WriteAllText(resultPath, input.Text); form.Close(); }
            };
            form.Controls.Add(input);
            form.Shown += (sender, eventArgs) =>
            {
                input.Focus();
                var center = form.PointToScreen(new Point(form.ClientSize.Width / 2, form.ClientSize.Height / 2));
                File.WriteAllText(readyPath, center.X + "," + center.Y + "," + expected);
            };
            Application.Run(form);
        }
        return 0;
    }

    private static int Drag(string[] args)
    {
        int fromX = int.Parse(args[1]);
        int fromY = int.Parse(args[2]);
        int toX = int.Parse(args[3]);
        int toY = int.Parse(args[4]);
        SetCursorPos(fromX, fromY);
        Thread.Sleep(120);
        mouse_event(MouseDown, 0, 0, 0, UIntPtr.Zero);
        for (int step = 1; step <= 80; step++)
        {
            SetCursorPos(fromX + ((toX - fromX) * step / 80), fromY + ((toY - fromY) * step / 80));
            mouse_event(MouseMove, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(25);
        }
        Thread.Sleep(500);
        mouse_event(MouseUp, 0, 0, 0, UIntPtr.Zero);
        return 0;
    }

    private static int Finish(int toX, int toY, string signalPath)
    {
        Point from;
        GetCursorPos(out from);
        for (int step = 1; step <= 80; step++)
        {
            SetCursorPos(from.X + ((toX - from.X) * step / 80), from.Y + ((toY - from.Y) * step / 80));
            mouse_event(MouseMove, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(25);
        }
        Thread.Sleep(500);
        if (!string.IsNullOrEmpty(signalPath)) File.WriteAllText(signalPath, "drop");
        Thread.Sleep(150);
        mouse_event(MouseUp, 0, 0, 0, UIntPtr.Zero);
        return 0;
    }
}
