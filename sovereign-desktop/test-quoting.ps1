# Test PowerShell script - simple test of quoting

# Test the current approach from the script
$bunPath = "C:\\path\\to\\bun.exe"
$daemonScript = "D:\\project\\sovereign-core\\src\\daemon\\index.ts"
$logFile = "C:\\Users\\test\\.sovereign\\sovereign.log"

# Method 1: Current approach
$method1_cmdArg = "/c `\"`\"${bunPath}`\"\' run `\"\'${daemonScript}`\"\' >> `\"\'${logFile}`\"\' 2>&1"
Write-Host "Method 1 cmdArg: $method1_cmdArg" -ForegroundColor Yellow

# Method 2: Simpler approach
$method2_cmdArg = '"' + $bunPath + '" run "' + $daemonScript + '" >> "' + $logFile + '" 2>&1'
Write-Host "Method 2 cmdArg: $method2_cmdArg" -ForegroundColor Green

# Method 3: Test with variables
$batPath = $bunPath
$scriptPath = $daemonScript
$logPath = $logFile
$runCommand = "$batPath run $scriptPath >> $logPath 2>&1"
$taskArg = '"' + $vbsScript + '" "cmd.exe $runCommand"'
Write-Host "Method 3 runCommand: $runCommand" -ForegroundColor Cyan
Write-Host "Method 3 taskArg: $taskArg" -ForegroundColor Cyan

Write-Host "Test completed successfully" -ForegroundColor Green