$taskName = "IntelliSmart_MDM_Hourly_Sync"
$vbsPath = "C:\Users\Dharmendra Pal Singh\OneDrive - INTELLI SMART\Desktop\MY Dashboard\Unified Master Dashboard\run_silent_hourly_sync.vbs"
$workDir = "C:\Users\Dharmendra Pal Singh\OneDrive - INTELLI SMART\Desktop\MY Dashboard\Unified Master Dashboard"

# Action: Run VBScript silently with wscript.exe, explicitly setting working directory
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $workDir

# Trigger: Start at 8:00 AM daily, repeat every 1 hour for 12 hours (until 8:00 PM)
$trigger = New-ScheduledTaskTrigger -Daily -At "8:00AM"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "8:00AM" -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 12)).Repetition

# Settings: Allow on battery, run when available if missed, stop if > 45 mins
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 45) -MultipleInstances IgnoreNew

# Unregister if already exists
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Register task under current user account
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Automated background hourly sync for IntelliSmart SBPDCL Dashboard (8 AM - 8 PM)"

$task = Get-ScheduledTask -TaskName $taskName
Write-Output "Task registered successfully: $($task.TaskName), State: $($task.State)"
