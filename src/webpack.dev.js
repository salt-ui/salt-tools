/**
 * Button Component for tingle
 * @author fushan
 *
 * Copyright 2014-2016, Tingle Team.
 * All rights reserved.
 */
var fs = require('fs');
var path = require('path');
var webpack = require('webpack');

module.exports = {
    cache: false,
    entry: {
        demo: './demo/src/index'
    },
    output: {
        path: './demo/dist',
        filename: "[name].js",
        sourceMapFilename: "[name].js.map"
    },
    devtool: '#source-map', // 这个配置要和output.sourceMapFilename一起使用
    module: {
        loaders: [
            {
                test: /(\.js(x)?|\.svg)$/,
                // node_modules都不需要经过babel解析
                exclude: /node_modules/,
                loader: 'babel-loader',
                query: {
                    presets: ['react', 'es2015', 'stage-1'].map(function(item) {
                        return require.resolve('babel-preset-' + item);
                    }),
                    plugins: [
                        'add-module-exports'
                    ].map(function(item) {
                        return require.resolve('babel-plugin-' + item);
                    }),
                    cacheDirectory: true,
                    babelrc: false,
                }
            }, {
                test: /\.svg$/,
                loader: 'svg2react'
            }
        ]
    },
    resolve: {
        root: [
            path.join(__dirname, '../node_modules')
        ],
        extensions: ['', '.web.ts', '.web.tsx', '.web.js', '.web.jsx', '.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    resolveLoader: {
        root: [
            path.join(__dirname, '../node_modules')
        ]
    },
    externals: {
        'react': 'var React', // 相当于把全局的React作为模块的返回 module.exports = React;
        'react-dom': 'var ReactDOM'
    },
    plugins: [
        new webpack.DefinePlugin({
          __LOCAL__: true, // 本地环境
          __DEV__:   true, // 日常环境
          __PRO__:   false // 生产环境
        })
    ]
};
