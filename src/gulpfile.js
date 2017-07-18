/**
 * tingle generator
 * @author fushan
 *
 * Copyright 2014-2016, Tingle Team.
 * All rights reserved.
 */
var gulp = require('gulp');
var fs = require('fs');
var inquirer = require('inquirer');
var file = require('html-wiring');
var colors = require('colors');

var babel = require('gulp-babel');
var uglify = require('gulp-uglify');
var webpack = require('webpack');
var browserSync = require('browser-sync');
var reload = browserSync.reload;
var sourcemaps = require('gulp-sourcemaps');
var stylus = require('gulp-stylus');
var rename = require('gulp-rename');
var concat = require('gulp-concat');
var replace = require('gulp-just-replace');
var gulpUniqueFile = require('gulp-unique-files');
var pathMap = require('gulp-pathmap');
var svgStore = require('gulp-svgstore');
var autoprefixer = require('gulp-autoprefixer');
var ejs = require('gulp-ejs');
var through = require('through2');
var spawn = require('cross-spawn');
var path = require('path');
var cloneDeep = require('lodash/cloneDeep');
var assign = require('lodash/assign');
var mergeWith = require('lodash/mergeWith');
var _ = require('lodash');

var util = require('./util');
const commonWebpackCfg = require('./webpack.dev.js');


var doQueryAndPub = function () {
    util.getQuestions().then(function (questions) {
        inquirer.prompt(questions).then(function (answers) {
            var pkg = util.getPkg();
            pkg.version = answers.version;
            file.writeFileFromString(JSON.stringify(pkg, null, '  '), 'package.json');
            console.log(colors.info('#### Git Info ####'));
            spawn.sync('git', ['add', '.'], { stdio: 'inherit' });
            spawn.sync('git', ['commit', '-m', 'ver. ' + pkg.version], { stdio: 'inherit' });
            spawn.sync('git', ['push', 'origin', answers.branch], { stdio: 'inherit' });
            console.log(colors.info('#### Npm Info ####'));
            spawn.sync(answers.npm, ['publish'], { stdio: 'inherit' });
        });
    });
}

gulp.task('pack_demo', function (cb) {
    var customWebpackCfg = {};
    var customWebpackCfgPath = path.join(process.cwd(), './webpack.custom.js');
    if (fs.existsSync(customWebpackCfgPath)) {
        customWebpackCfg = require(customWebpackCfgPath);
    }
    var timeEnd = new Date().getTime();

    webpack(mergeWith(commonWebpackCfg, customWebpackCfg, function (objValue, srcValue) {
        if (Array.isArray(objValue) && Array.isArray(srcValue)) {
            return objValue.concat(srcValue);
        }
    }), function (err, stats) {
        // 重要 打包过程中的语法错误反映在stats中
        console.log('webpack log:' + stats);
        if (stats.hasErrors()) {
            // 异常日志打印到屏幕
            fs.writeFileSync('./demo/dist/demo.js', [
                'document.body.innerHTML="<pre>',
                stats.toJson().errors[0].replace(/[\n\r]/g, '<br>').replace(/\[\d+m/g, '').replace(/"/g, '\\"'),
                '</pre>";',
                'document.body.firstChild.style.fontFamily="monospace";',
                'document.body.firstChild.style.lineHeight="1.5em";',
                'document.body.firstChild.style.margin="1em";',
            ].join(''));
        }
        console.info('###### pack_demo done ######');
        cb();
    });
});

gulp.task('icon-make-js', function (cb) {
    var svgs = fs.readdirSync(path.join(process.cwd(), './src/svg')).filter(function (name) {
        return /\.svg$/.test(name);
    }).map(function (name) {
        return name.replace(/\.svg$/, '');
    });
    var count = 0;
    svgs.forEach(function (name) {
        var camelName = _.camelCase(name);
        var IconName = camelName[0].toUpperCase() + camelName.slice(1);
        gulp
            .src([
                path.join(__dirname, './templates/Icon.js'),
            ])
            .pipe(ejs({
                iconname: name,
                IconName: IconName,
            }))
            .pipe(rename(IconName + '.js'))
            .pipe(gulp.dest('src/lib'))
            .on('end', function () {
                count += 1;
                if (count === svgs.length) {
                    cb();
                    console.info('###### icon-make-js done ######');
                }
            })
    })
});

gulp.task('icon-build', function (cb) {
    var icons = fs.readdirSync(path.join(process.cwd(), './src/lib'));
    var entries = {};
    icons.forEach(function (icon) {
        var name = icon.replace(/\.js$/, '');
        entries[name] = './src/lib/' + name;
    });
    var config = cloneDeep(commonWebpackCfg);
    var count = 0;
    assign(config, {
        entry: entries,
        output: {
            path: './lib',
            filename: "[name].js",
            libraryTarget: 'commonjs2',
        },
        externals: {
            react: 'commonjs react',
            classnames: 'commonjs classnames',
            'react-dom': 'commonjs react-dom',
        }
    });
    delete config.devtool;
    webpack(config, function (err, stats) {
        count += 1;
        if (count === 2) {
            cb();
            console.info('###### icon-build done ######');
        }
    });
    util.buildJs([path.join(process.cwd(), './src/*.js'), path.join(process.cwd(), './src/*.jsx')], function () {
        count += 1;
        if (count === 2) {
            cb();
            console.info('###### icon-build done ######');
        }
    });
});

gulp.task('stylus_demo', function (cb) {
    gulp.src([
        path.join(process.cwd(), './demo/src/**/*.styl')
    ])
        .pipe(sourcemaps.init())
        .pipe(stylus({
            'include css': true,
        }))
        .on('error', function (error) {
            console.log(error);
            this.emit('end');
        })
        .pipe(autoprefixer({
            browsers: ['iOS >= 7', 'Android >= 2.3', 'FireFoxAndroid >= 46', '> 1%'],
        }))
        .pipe(concat('demo.css'))
        .pipe(replace([{
            search: /\/\*#\ssourceMappingURL=([^\*\/]+)\.map\s\*\//g,
            replacement: '/* end for `$1` */\n'
        }]))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(path.join(process.cwd(), './demo/dist')));
    console.info('###### stylus_demo done ######');
    cb();
});

// 命名方式是 xxx.svg, 会把fill都干掉
// 命名方式是 xxx.color.svg, 会保留svg中的颜色
// 命名方式是 xxx.ignore.svg, 会忽略该svg文件
function svgFilter() {
    return through.obj(function (file, enc, cb) {

        // console.log(file.path + ':\n');
        if (!!file.path.match(/\.color\.svg$/)) {
            //console.log('file.path');
            file.path = file.path.replace(/\.color\.svg$/, '.svg');
        } else if (!!file.path.match(/\.ignore\.svg$/)) {
            cb();
            return;
        } else {
            var fileContent = file.contents.toString();

            // FIXME 这个地方还要增强, `illustrator`和`sketch`导出的`svg`文件, 表示颜色的方式不一致!!!
            file.contents = new Buffer(fileContent.replace(/\sfill="[^"]*\"\s?/g, ' '));
        }

        this.push(file);
        cb();
    });
}

gulp.task('svg', function () {
    var buildName = 'tingle-icon-symbols.svg';
    return gulp.src([
        // 多套皮肤共用的`icon`文件集合
        './node_modules/@ali/tingle-icon-source/common/*.svg',

        // 默认皮肤使用的`icon`文件集合
        './node_modules/@ali/tingle-icon-source/default/*.svg',

        // 依赖的组件私有的`icon`文件集合
        './node_modules/@ali/tingle-*/src/svg/*.svg',

        // 当前组件demo的`icon`文件
        './demo/src/svg/*.svg',

        // 当前组件私有的`icon`文件, 不安规范命名的`icon`不会打进来!!!, 不包含`tingle-`
        './src/svg/button-*.svg',

        // 构建好的`symbol`文件, 需要排除
        '!./demo/src/svg/' + buildName
    ])
        .pipe(pathMap('%f'))
        .pipe(gulpUniqueFile())
        .pipe(svgFilter())
        .pipe(svgStore())
        .pipe(rename(buildName))
        .pipe(gulp.dest('./demo/src/svg'));
});

gulp.task('reload_by_js', ['pack_demo'], function () {
    console.log('reload_by_js');
    reload();
});

gulp.task('reload_by_demo_css', ['stylus_demo'], function () {
    reload();
});

gulp.task('reload_by_svg', function () {
    reload();
});

// 开发`Tingle component`时，执行`gulp develop` or `gulp d`
gulp.task('develop', [
    'pack_demo',
    'stylus_demo',
], function () {
    browserSync({
        server: {
            baseDir: './'
        },
        open: 'external'
    });

    gulp.watch([
        path.join(process.cwd(), './src/**/*.js'),
        path.join(process.cwd(), './src/**/*.jsx'),
        path.join(process.cwd(), './demo/src/**/*.js'),
        path.join(process.cwd(), './demo/src/**/*.jsx'),
    ], ['reload_by_js']);

    gulp.watch(path.join(process.cwd(), './src/**/*.styl'), ['reload_by_demo_css']);

    gulp.watch(path.join(process.cwd(), './demo/src/**/*.styl'), ['reload_by_demo_css']);

    // 监听svg icon文件的变化
    gulp.watch([
        'src/svg/*.svg'
    ], ['reload_by_svg']);
});

// 构建css
gulp.task('build_css', function (cb) {
    gulp.src([path.join(process.cwd(), './src/**/Button.styl')])
        .pipe(stylus())
        .pipe(gulp.dest('dist'));
    console.info('###### build_css done ######');
    cb();
});

// 构建js
gulp.task('build_js', function (cb) {
    util.buildJs([path.join(process.cwd(), './src/**/*.js'), path.join(process.cwd(), './src/**/*.jsx')], cb);
});

gulp.task('copy_logo_ide', function () {
    return gulp.src(path.join(process.cwd(), './src/logo-ide.svg'))
        .pipe(gulp.dest('dist'));
});

// 发布 tnpm, 防止忘记 build
gulp.task('publish', ['build_js', 'copy_logo_ide'], function () {
    doQueryAndPub();
});

gulp.task('icon-publish', ['icon-build', 'copy_logo_ide'], function () {
    doQueryAndPub();
})

gulp.task('dep', function () {
    var commands = util.getPackages();
    util.runCmd('npm', ['i', '-d'].concat(commands));
});

gulp.task('update', function () {
    var commands = util.getPackages();
    util.runCmd('npm', ['update', '-d'].concat(commands));
});

gulp.task('tnpm-dep', function () {
    var commands = util.getPackages();
    util.runCmd('tnpm', ['i', '-d'].concat(commands));
});

gulp.task('tnpm-update', function () {
    var commands = util.getPackages();
    console.log('getting tnpm version...')
    util.runCmd('tnpm', ['-v'], function () { }, function (data) {
        var tnpmVersion = data.match(/tnpm@(\d)/);
        if (parseInt(tnpmVersion[1], 10) === 4) {
            util.runCmd('rm', ['-rf', 'node_modules/'], function () {
                console.log('install dependencies...')
                util.runCmd('npm', ['run', 'tnpm-dep']);
            });
        } else {
            util.runCmd('tnpm', ['update', '-d'].concat(commands));
        }
    })

});

// 快捷方式
gulp.task('start', ['develop']);
gulp.task('build', ['build_js', 'copy_logo_ide']);
gulp.task('pub', ['publish']);

// 保留nowa的命令
gulp.task('server', ['develop']);
