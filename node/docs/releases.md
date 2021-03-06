# VSTS-TASK-LIB RELEASES

## 0.9.8
 * Updated `setVariable` to expose an optional boolean parameter `secret`.
 * Added `getVariables` to get an array of all variables, secret and non-secret.
 * Updated `mkdirP` to improve error messages.
 * Updated `find` to expose options whether to follow symlinks.
 * Updated `match` to provide an overload that accepts an array of patterns.

## 0.9.5
 * API clean up as we approach 1.0 major version
 * Added typings to npm module so typescript and VS Code finds easily 
 * `tl.createToolRunner()` changed to `tl.tool()`;
 * `tr.arg`, `tr.argIf` returns ToolRunner now for easy chaining
 * `tr.argString` changed to `tr.line`
 * `tr.argPath` removed.  It was a compat only useless method.
 * changes above allow easy lines like `await tl.tool('git').arg('--version');`

## 0.8.2
  * Pattern change.  Use async function with code in try/catch.  SetResult to fail in the catch.  See samples.
  * setResult will not halt execution.  Process.exit caused output loss in some scenarios.
  * All GetInput functions will throw if required and not supplied
  * Disk operations will throw if they fail
  * mv and cp take options string as optional arg

## 0.8.x
 * Starting API clean of deprecated method.
 * tl.exit() removed.  Unsafe to exit process.  Script should execute

## 0.7.3
 * Updated `setResult` to log the message as an error issue if the result is Failed.

## 0.7.2
 * Updated `getDelimitedInput` to remove empty entries.

## 0.7.1
 * Updated `ToolRunner` to emit lines.
 * Fixed initialization so that `.taskkey` file is not left in the repo root.

## 0.7.0
 * Updated `ToolRunner.arg` to simply append to the arg array that is passed to `spawn`.
 * Added `ToolRunner.argString` to split additional arguments, which are then appended to the arg array that is passed to `spawn`.
