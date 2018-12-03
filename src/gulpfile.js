/**
 * tingle generator
 * @author fushan
 *
 * Copyright 2014-2016, Tingle Team.
 * All rights reserved.
 */
const gulp = require('gulp');
const fs = require('fs');
const inquirer = require('inquirer');
const file = require('html-wiring');
const colors = require('colors');

// const babel = require('gulp-babel');
// const uglify = require('gulp-uglify');
const webpack = require('webpack');
const browserSync = require('browser-sync');

const sourcemaps = require('gulp-sourcemaps');
const stylus = require('gulp-stylus');
const rename = require('gulp-rename');
const concat = require('gulp-concat');
const replace = require('gulp-just-replace');
const gulpUniqueFile = require('gulp-unique-files');
const pathMap = require('gulp-pathmap');
const svgStore = require('gulp-svgstore');
const autoprefixer = require('gulp-autoprefixer');
const ejs = require('gulp-ejs');
const through = require('through2');
const spawn = require('cross-spawn');
const path = require('path');
const cloneDeep = require('lodash/cloneDeep');
const assign = require('lodash/assign');
const mergeWith = require('lodash/mergeWith');
const _ = require('lodash');

const util = require('./util');
const commonWebpackCfg = require('./webpack.dev.js');

const { reload } = browserSync;


const doQueryAndPub = () => {
  util.getQuestions().then((questions) => {
    inquirer.prompt(questions).then((answers) => {
      const pkg = util.getPkg();
      pkg.version = answers.version;
      file.writeFileFromString(JSON.stringify(pkg, null, '  '), 'package.json');
      console.log(colors.info('#### Git Info ####'));
      spawn.sync('git', ['add', '.'], { stdio: 'inherit' });
      spawn.sync('git', ['commit', '-m', `ver. ${pkg.version}`], { stdio: 'inherit' });
      spawn.sync('git', ['push', 'origin', answers.branch], { stdio: 'inherit' });
      console.log(colors.info('#### Npm Info ####'));
      spawn.sync(answers.npm, ['publish'], { stdio: 'inherit' });
    });
  });
};

gulp.task('pack_demo', (cb) => {
  let customWebpackCfg = {};
  const customWebpackCfgPath = path.join(process.cwd(), './webpack.custom.js');
  if (fs.existsSync(customWebpackCfgPath)) {
    customWebpackCfg = require(customWebpackCfgPath);
  }
  //   const timeEnd = new Date().getTime();

  webpack(mergeWith(commonWebpackCfg, customWebpackCfg, (objValue, srcValue) => {
    if (Array.isArray(objValue) && Array.isArray(srcValue)) {
      return objValue.concat(srcValue);
    }
  }), (err, stats) => {
    // 重要 打包过程中的语法错误反映在stats中
    console.log(`webpack log:${stats}`);
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

gulp.task('icon-make-js', (cb) => {
  const svgs = fs.readdirSync(path.join(process.cwd(), './src/svg')).filter(name => /\.svg$/.test(name)).map(name => name.replace(/\.svg$/, ''));
  let count = 0;
  svgs.forEach((name) => {
    const camelName = _.camelCase(name);
    const IconName = camelName[0].toUpperCase() + camelName.slice(1);
    gulp
      .src([
        path.join(__dirname, './templates/Icon.js'),
      ])
      .pipe(ejs({
        iconname: name,
        IconName,
      }))
      .pipe(rename(`${IconName}.js`))
      .pipe(gulp.dest('src/lib'))
      .on('end', () => {
        count += 1;
        if (count === svgs.length) {
          cb();
          console.info('###### icon-make-js done ######');
        }
      });
  });
});

gulp.task('icon-build', (cb) => {
  const icons = fs.readdirSync(path.join(process.cwd(), './src/lib'));
  const entries = {};
  icons.forEach((icon) => {
    const name = icon.replace(/\.js$/, '');
    entries[name] = `./src/lib/${name}`;
  });
  const config = cloneDeep(commonWebpackCfg);
  let count = 0;
  assign(config, {
    entry: entries,
    output: {
      path: './lib',
      filename: '[name].js',
      libraryTarget: 'commonjs2',
    },
    externals: {
      react: 'commonjs react',
      classnames: 'commonjs classnames',
      'react-dom': 'commonjs react-dom',
      'prop-types': 'commonjs prop-types',
    },
  });
  delete config.devtool;
  webpack(config, (err, stats) => {
    count += 1;
    if (count === 2) {
      cb();
      console.info('###### icon-build done ######');
    }
  });
  util.buildJs([path.join(process.cwd(), './src/*.js'), path.join(process.cwd(), './src/*.jsx')], () => {
    count += 1;
    if (count === 2) {
      cb();
      console.info('###### icon-build done ######');
    }
  });
});

gulp.task('stylus_demo', (cb) => {
  gulp.src([
    path.join(process.cwd(), './demo/src/**/*.styl'),
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
      replacement: '/* end for `$1` */\n',
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
    if (file.path.match(/\.color\.svg$/)) {
      // console.log('file.path');
      file.path = file.path.replace(/\.color\.svg$/, '.svg');
    } else if (file.path.match(/\.ignore\.svg$/)) {
      cb();
      return;
    } else {
      const fileContent = file.contents.toString();

      // FIXME 这个地方还要增强, `illustrator`和`sketch`导出的`svg`文件, 表示颜色的方式不一致!!!
      file.contents = new Buffer(fileContent.replace(/\sfill="[^"]*\"\s?/g, ' '));
    }

    this.push(file);
    cb();
  });
}

gulp.task('svg', () => {
  const buildName = 'tingle-icon-symbols.svg';
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
    `!./demo/src/svg/${buildName}`,
  ])
    .pipe(pathMap('%f'))
    .pipe(gulpUniqueFile())
    .pipe(svgFilter())
    .pipe(svgStore())
    .pipe(rename(buildName))
    .pipe(gulp.dest('./demo/src/svg'));
});

gulp.task('reload_by_js', ['pack_demo'], () => {
  console.log('reload_by_js');
  reload();
});

gulp.task('reload_by_demo_css', ['stylus_demo'], () => {
  reload();
});

gulp.task('reload_by_svg', () => {
  reload();
});

// 开发`Tingle component`时，执行`gulp develop` or `gulp d`
gulp.task('develop', [
  'pack_demo',
  'stylus_demo',
], () => {
  browserSync({
    server: {
      baseDir: './',
    },
    open: 'external',
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
    'src/svg/*.svg',
  ], ['reload_by_svg']);
});

// 构建css
gulp.task('build_css', (cb) => {
  gulp.src([path.join(process.cwd(), './src/**/Button.styl')])
    .pipe(stylus())
    .pipe(gulp.dest('dist'));
  console.info('###### build_css done ######');
  cb();
});

// 构建js
gulp.task('build_js', (cb) => {
  util.buildJs([path.join(process.cwd(), './src/**/*.js'), path.join(process.cwd(), './src/**/*.jsx')], cb);
});

gulp.task('copy_logo_ide', () => gulp.src(path.join(process.cwd(), './src/logo-ide.svg'))
  .pipe(gulp.dest('dist')));

// 发布 tnpm, 防止忘记 build
gulp.task('publish', ['build_js', 'copy_logo_ide'], () => {
  doQueryAndPub();
});

gulp.task('icon-publish', ['icon-build', 'copy_logo_ide'], () => {
  doQueryAndPub();
});

gulp.task('dep', () => {
  const commands = util.getPackages();
  util.runCmd('npm', ['i', '-d', '--no-save'].concat(commands));
});

gulp.task('update', () => {
  const commands = util.getPackages();
  util.runCmd('npm', ['update', '-d'].concat(commands.map(cmd => cmd.split('@')[0])));
});

gulp.task('tnpm-dep', () => {
  const commands = util.getPackages();
  util.runCmd('tnpm', ['i', '-d', '--by=npm', '--no-save'].concat(commands));
});

gulp.task('tnpm-update', () => {
  const commands = util.getPackages();
  console.log('getting tnpm version...');
  util.runCmd('tnpm', ['-v'], () => { }, (data) => {
    const tnpmVersion = data.match(/tnpm@(\d)/);
    if (parseInt(tnpmVersion[1], 10) === 4) {
      util.runCmd('rm', ['-rf', 'node_modules/'], () => {
        console.log('install dependencies...');
        util.runCmd('npm', ['run', 'tnpm-dep']);
      });
    } else {
      util.runCmd('tnpm', ['update', '-d', '--by=npm'].concat(commands.map(cmd => cmd.split('@')[0])));
    }
  });
});

// 快捷方式
gulp.task('start', ['develop']);
gulp.task('build', ['build_js', 'copy_logo_ide']);
gulp.task('pub', ['publish']);

// 保留nowa的命令
gulp.task('server', ['develop']);
