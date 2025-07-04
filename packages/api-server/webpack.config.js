const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/main.ts',
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      'shared': path.resolve(__dirname, '../../libs/shared/src'),
      'database': path.resolve(__dirname, '../../libs/database/src'),
    },
  },
  externals: [nodeExternals({
    modulesDir: path.resolve(__dirname, '../../node_modules'),
    allowlist: [/^shared/, /^database/]
  })],
  output: {
    filename: 'server.js',
    path: path.resolve(__dirname, 'dist'),
  },
};