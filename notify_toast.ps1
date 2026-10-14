param(
    [string]$Title = "IntelliSmart SBPDCL Auto-Sync",
    [string]$Message = "Daily MDM sync completed successfully!",
    [int]$TimeoutSeconds = 8
)

# XML-safe escaping
$SafeTitle = [System.Security.SecurityElement]::Escape($Title)
$SafeMessage = [System.Security.SecurityElement]::Escape($Message)

# 1. Native Windows 10/11 Toast Notification with sound in Notification Tray
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
<toast duration="short">
    <visual>
        <binding template="ToastGeneric">
            <text>$SafeTitle</text>
            <text>$SafeMessage</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default" />
</toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe")
    $notifier.Show($toast)
} catch {}

# 2. Visual Desktop Popup Dialog (Auto-closes after $TimeoutSeconds if unattended)
try {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.Popup($Message, $TimeoutSeconds, $Title, 64) | Out-Null
} catch {}
