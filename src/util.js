var file = require('html-wiring');
var path = require('path');
var pkg = JSON.parse(file.readFileAsString('package.json'));
var eslintCfg = JSON.parse(file.readFileAsString(__dirname + '/eslintrc.json'));
var userLintCfg;
var Promise = require('promise');
var git = require('git-rev');
var gulp = require('gulp');
var babel = require('gulp-babel');

try {
    userLintCfg = JSON.parse(file.readFileAsString(path.join(process.cwd(), './.eslintrc.json')));
} catch (e) { }

var utils = {
    versionCompare: function (a, b) {
        var aArr = a.split('.');
        var bArr = b.split('.');
        var larger = false;
        for (var i = 0; i < 3; i++) {
            if (parseInt(aArr[i]) === parseInt(bArr[i])) {

            }
            else {
                larger = parseInt(aArr[i]) > parseInt(bArr[i]);
                break;
            }
        }
        return larger;
    },
    runCmd: function (cmd, args, fn, stdoutFn) {
        args = args || [];
        var runner = require('child_process').spawn(cmd, args, {
            // keep color
            stdio: stdoutFn ? 'pipe' : 'inherit',
        });
        if (stdoutFn) {
            runner.stdout.on('data', function (data) {
                stdoutFn(data.toString());
            });
        }
        runner.on('close', function (code) {
            if (fn) {
                fn(code);
            }
        });
    },
    getFromCwd: function () {
        var args = [].slice.call(arguments, 0);
        args.unshift(process.cwd());
        return path.join.apply(path, args);
    },
    getPkg: function () {
        return pkg;
    },
    getEslintCfg: function () {
        return userLintCfg || eslintCfg;
    },
    getPackages: function () {
        var commands = [];
        for (var item in pkg.devDependencies) {
            if (item !== 'salt-tools') {
                commands.push(item + '@' + pkg.devDependencies[item]);
            }
        }
        commands.push('--production');
        return commands;
    },
    getQuestions: function () {
        var me = this;
        return new Promise(function (resolve, reject) {
            git.branch(function (branch) {
                var defaultBranch = branch;
                var defaultNpm = /@ali/.test(pkg.name) ? 'tnpm' : 'npm';
                var questions = [
                    {
                        type: 'input',
                        name: 'version',
                        message: 'please enter the package version to publish (should be xx.xx.xx)',
                        default: pkg.version,
                        validate: function (input) {
                            if (/\d+\.\d+\.\d+/.test(input)) {
                                if (me.versionCompare(input, pkg.version)) {
                                    return true;
                                }
                                else {
                                    return "the version you entered should be larger than now"
                                }
                            }
                            else {
                                return "the version you entered is not valid"
                            }
                        }
                    },
                    {
                        type: 'input',
                        name: 'branch',
                        message: 'which branch you want to push',
                        default: defaultBranch
                    },
                    {
                        type: 'input',
                        name: 'npm',
                        message: 'which npm you want to publish',
                        default: defaultNpm,
                        validate: function (input) {
                            if (/npm/.test(input)) {
                                return true;
                            }
                            else {
                                return "it seems not a valid npm"
                            }
                        }
                    }
                ];
                resolve(questions);
            });
        })
    },
    buildJs: function (path, cb) {
        gulp.src(path)
            .pipe(babel({
                presets: ['react', 'es2015', 'stage-1'].map(function (item) {
                    return require.resolve('babel-preset-' + item);
                }),
                plugins: ['add-module-exports'].map(function (item) {
                    return require.resolve('babel-plugin-' + item);
                }),
            }))
            .pipe(gulp.dest('dist'))
            .on('end', function () {
                console.log('###### build_js done ######')
                if (cb) {
                    cb();
                }
            });
    }
}

module.exports = utils;