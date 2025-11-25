const path = require('path');

module.exports = {
  entry: './src/worker.ts',
  target: 'webworker',
  output: {
    path: path.resolve(__dirname, '../dist'),
    filename: 'sas-language-server.worker.js',
    library: {
      type: 'module',
    },
  },
  experiments: {
    outputModule: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      path: false,
      fs: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  mode: 'production',
  optimization: {
    minimize: true,
  },
};
