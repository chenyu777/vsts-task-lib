

import Q = require('q');
import os = require('os');
import events = require('events');
import child = require('child_process');
import stream = require('stream');
import tcm = require('./taskcommand');

var run = function(cmd, callback) {
    console.log('running: ' + cmd);
    var output = '';
    try {
      
    }
    catch(err) {
        console.log(err.message);
    }

}

/**
 * Interface for exec options
 * 
 * @param     cwd        optional working directory.  defaults to current 
 * @param     env        optional envvar dictionary.  defaults to current processes env
 * @param     silent     optional.  defaults to false
 * @param     failOnStdErr     optional.  whether to fail if output to stderr.  defaults to false
 * @param     ignoreReturnCode     optional.  defaults to failing on non zero.  ignore will not fail leaving it up to the caller
 */
export interface IExecOptions {
    cwd: string;
    env: { [key: string]: string };
    silent: boolean;
    failOnStdErr: boolean;
    ignoreReturnCode: boolean;
    outStream: stream.Writable;
    errStream: stream.Writable;
};

/**
 * Interface for exec results returned from synchronous exec functions
 * 
 * @param     stdout      standard output
 * @param     stderr      error output
 * @param     code        return code
 * @param     error       Error on failure
 */
export interface IExecResult {
    stdout: string;
    stderr: string;
    code: number;
    error: Error;
}

export class ToolRunner extends events.EventEmitter {
    constructor(toolPath) {
        super();
        
        this.toolPath = toolPath;
        this.args = [];
        this.silent = false;
        this._debug('toolRunner toolPath: ' + toolPath);
    }

    public toolPath: string;
    public args: string[];
    public silent: boolean;

    private _debug(message) {
        if (!this.silent) {
            this.emit('debug', message);
        }
    }

    private _argStringToArray(argString: string): string[] {
        var args = [];

        var inQuotes = false;
        var escaped =false;
        var arg = '';

        var append = function(c) {
            // we only escape double quotes.
            if (escaped && c !== '"') {
                arg += '\\';
            }

            arg += c;
            escaped = false;
        }

        for (var i=0; i < argString.length; i++) {
            var c = argString.charAt(i);

            if (c === '"') {
                if (!escaped) {
                    inQuotes = !inQuotes;
                }
                else {
                    append(c);
                }
                continue;
            }
            
            if (c === "\\" && inQuotes) {
                escaped = true;
                continue;
            }

            if (c === ' ' && !inQuotes) {
                if (arg.length > 0) {
                    args.push(arg);
                    arg = '';
                }
                continue;
            }

            append(c);
        }

        if (arg.length > 0) {
            args.push(arg.trim());
        }

        return args;
    }

    /**
     * Add argument
     * Append an argument or an array of arguments 
     * returns ToolRunner for chaining
     * 
     * @param     val        string cmdline or array of strings
     * @returns   ToolRunner
     */
    public arg(val: string | string[]): ToolRunner {
        if (!val) {
            return;
        }

        if (val instanceof Array) {
            this._debug(this.toolPath + ' arg: ' + JSON.stringify(val));
            this.args = this.args.concat(val);
        }
        else if (typeof(val) === 'string') {
            this._debug(this.toolPath + ' arg: ' + val);
            this.args = this.args.concat(val.trim());
        }

        return this;
    }

    /**
     * Append argument command line string
     * e.g. '"arg one" two -z' would append args[]=['arg one', 'two', '-z']
     * returns ToolRunner for chaining 
     * 
     * @param     val        string cmdline
     * @returns   ToolRunner
     */
    public line(val: string): ToolRunner {
        if (!val) {
            return;
        }

        this._debug(this.toolPath + ' arg: ' + val);
        this.args = this.args.concat(this._argStringToArray(val));
        return this;    
    }
    
    /**
     * Add argument(s) if a condition is met
     * Wraps arg().  See arg for details
     * returns ToolRunner for chaining
     *
     * @param     condition     boolean condition
     * @param     val     string cmdline or array of strings
     * @returns   ToolRunner
     */
    public argIf(condition: any, val: any) {
        if (condition) {
            this.arg(val);
        }
        return this;
    }

    /**
     * Exec a tool.
     * Output will be streamed to the live console.
     * Returns promise with return code
     * 
     * @param     tool     path to tool to exec
     * @param     options  optional exec options.  See IExecOptions
     * @returns   number
     */
    public exec(options?: IExecOptions): Q.Promise<number> {
        var defer = Q.defer<number>();

        this._debug('exec tool: ' + this.toolPath);
        this._debug('Arguments:');
        this.args.forEach((arg) => {
            this._debug('   ' + arg);
        });

        var success = true;
        options = options || <IExecOptions>{};

        var ops: IExecOptions = <IExecOptions>{
            cwd: options.cwd || process.cwd(),
            env: options.env || process.env,
            silent: options.silent || false,
            failOnStdErr: options.failOnStdErr || false,
            ignoreReturnCode: options.ignoreReturnCode || false
        };

        ops.outStream = options.outStream || <stream.Writable>process.stdout;
        ops.errStream = options.errStream || <stream.Writable>process.stderr;

        var argString = this.args.join(' ') || '';
        var cmdString = this.toolPath;
        if (argString) {
            cmdString += (' ' + argString);
        }

        if (!ops.silent) {
            ops.outStream.write('[command]' + cmdString + os.EOL);    
        }

        // TODO: filter process.env

        var cp = child.spawn(this.toolPath, this.args, { cwd: ops.cwd, env: ops.env });

        var processLineBuffer = (data: Buffer, strBuffer: string, onLine:(line: string) => void): void => {
            try {
                var s = strBuffer + data.toString();
                var n = s.indexOf(os.EOL);

                while(n > -1) {
                    var line = s.substring(0, n);
                    onLine(line);

                    // the rest of the string ...
                    s = s.substring(n + os.EOL.length);
                    n = s.indexOf(os.EOL);
                }

                strBuffer = s;                
            }
            catch (err) {
                // streaming lines to console is best effort.  Don't fail a build.
                this._debug('error processing line');
            }

        }

        var stdbuffer: string = '';
        cp.stdout.on('data', (data: Buffer) => {
            this.emit('stdout', data);

            if (!ops.silent) {
                ops.outStream.write(data);    
            }

            processLineBuffer(data, stdbuffer, (line: string) => {
                this.emit('stdline', line);    
            });
        });

        var errbuffer: string = '';
        cp.stderr.on('data', (data: Buffer) => {
            this.emit('stderr', data);

            success = !ops.failOnStdErr;
            if (!ops.silent) {
                var s = ops.failOnStdErr ? ops.errStream : ops.outStream;
                s.write(data);
            }

            processLineBuffer(data, errbuffer, (line: string) => {
                this.emit('errline', line);    
            });            
        });

        cp.on('error', (err) => {
            defer.reject(new Error(this.toolPath + ' failed. ' + err.message));
        });

        cp.on('close', (code, signal) => {
            this._debug('rc:' + code);

            if (stdbuffer.length > 0) {
                this.emit('stdline', stdbuffer);
            }
            
            if (errbuffer.length > 0) {
                this.emit('errline', errbuffer);
            }

            if (code != 0 && !ops.ignoreReturnCode) {
                success = false;
            }
            
            this._debug('success:' + success);
            if (success) {
                defer.resolve(code);
            }
            else {
                defer.reject(new Error(this.toolPath + ' failed with return code: ' + code));
            }      
        });

        return <Q.Promise<number>>defer.promise;
    }

    /**
     * Exec a tool synchronously. 
     * Output will be *not* be streamed to the live console.  It will be returned after execution is complete.
     * Appropriate for short running tools 
     * Returns IExecResult with output and return code
     * 
     * @param     tool     path to tool to exec
     * @param     options  optionalexec options.  See IExecOptions
     * @returns   IExecResult
     */
    public execSync(options?: IExecOptions): IExecResult {
        var defer = Q.defer();

        this._debug('exec tool: ' + this.toolPath);
        this._debug('Arguments:');
        this.args.forEach((arg) => {
            this._debug('   ' + arg);
        });

        var success = true;
        options = options || <IExecOptions>{};

        var ops: IExecOptions = <IExecOptions>{
            cwd: options.cwd || process.cwd(),
            env: options.env || process.env,
            silent: options.silent || false,
            failOnStdErr: options.failOnStdErr || false,
            ignoreReturnCode: options.ignoreReturnCode || false
        };

        ops.outStream = options.outStream || <stream.Writable>process.stdout;
        ops.errStream = options.errStream || <stream.Writable>process.stderr;

        var argString = this.args.join(' ') || '';
        var cmdString = this.toolPath;
        if (argString) {
            cmdString += (' ' + argString);
        }

        if (!ops.silent) {
            ops.outStream.write('[command]' + cmdString + os.EOL);    
        }
        
        var r = child.spawnSync(this.toolPath, this.args, { cwd: ops.cwd, env: ops.env });
        
        if (r.stdout && r.stdout.length > 0) {
            ops.outStream.write(r.stdout);
        }

        if (r.stderr && r.stderr.length > 0) {
            ops.errStream.write(r.stderr);
        }

        var res:IExecResult = <IExecResult>{ code: r.status, error: r.error };
        res.stdout = (r.stdout) ? r.stdout.toString() : null;
        res.stderr = (r.stderr) ? r.stderr.toString() : null;
        return res;
    }

    public pipe(tool: ToolRunner, options?: IExecOptions) : Q.Promise<number> {
        var defer = Q.defer<number>();

        var success = true;
        options = options || <IExecOptions>{};

        var ops: IExecOptions = <IExecOptions>{
            cwd: options.cwd || process.cwd(),
            env: options.env || process.env,
            silent: options.silent || false,
            failOnStdErr: options.failOnStdErr || false,
            ignoreReturnCode: options.ignoreReturnCode || false
        };

        ops.outStream = options.outStream || <stream.Writable>process.stdout;
        ops.errStream = options.errStream || <stream.Writable>process.stderr;

        var argString1 = this.args.join(' ') || '';
        var cmdString1 = this.toolPath;
        if (argString1) {
            cmdString1 += (' ' + argString1);
        }

        var argString2 = tool.args.join(' ') || '';
        var cmdString2 = tool.toolPath;
        if (argString2) {
            cmdString2 += (' ' + argString2);
        }

        if (!ops.silent) {
            ops.outStream.write('[command]' + cmdString1 + ' | ' + cmdString2  + os.EOL);
        }

        var cpFirst = child.spawn(this.toolPath, this.args, { cwd: ops.cwd, env: ops.env });
        var cpSecond = child.spawn(tool.toolPath, tool.args, { cwd: ops.cwd, env: ops.env });

        cpFirst.stdout.on('data', (data: Buffer) => {
            cpSecond.stdin.write(data);
        });
        cpFirst.stderr.on('data', (data: Buffer) => {
            cpSecond.stdin.write(data);
        });
        cpFirst.on('close', (code, signal) => {
            cpSecond.stdin.end();
        });

        var processLineBuffer = (data: Buffer, strBuffer: string, onLine:(line: string) => void): void => {
            try {
                var s = strBuffer + data.toString();
                var n = s.indexOf(os.EOL);

                while(n > -1) {
                    var line = s.substring(0, n);
                    onLine(line);

                    // the rest of the string ...
                    s = s.substring(n + os.EOL.length);
                    n = s.indexOf(os.EOL);
                }

                strBuffer = s;
            }
            catch (err) {
                // streaming lines to console is best effort.  Don't fail a build.
                this._debug('error processing line');
            }

        }

        var stdbuffer: string = '';
        cpSecond.stdout.on('data', (data: Buffer) => {
            this.emit('stdout', data);

            if (!ops.silent) {
                ops.outStream.write(data);
            }

            processLineBuffer(data, stdbuffer, (line: string) => {
                this.emit('stdline', line);
            });
        });

        var errbuffer: string = '';
        cpSecond.stderr.on('data', (data: Buffer) => {
            this.emit('stderr', data);

            success = !ops.failOnStdErr;
            if (!ops.silent) {
                var s = ops.failOnStdErr ? ops.errStream : ops.outStream;
                s.write(data);
            }

            processLineBuffer(data, errbuffer, (line: string) => {
                this.emit('errline', line);
            });
        });

        cpSecond.on('error', (err) => {
            defer.reject(new Error(this.toolPath + ' failed. ' + err.message));
        });

        cpSecond.on('close', (code, signal) => {
            this._debug('rc:' + code);

            if (stdbuffer.length > 0) {
                this.emit('stdline', stdbuffer);
            }

            if (errbuffer.length > 0) {
                this.emit('errline', errbuffer);
            }

            if (code != 0 && !ops.ignoreReturnCode) {
                success = false;
            }

            this._debug('success:' + success);
            if (success) {
                defer.resolve(code);
            }
            else {
                defer.reject(new Error(this.toolPath + ' failed with return code: ' + code));
            }
        });

        return <Q.Promise<number>>defer.promise;
    }
}
