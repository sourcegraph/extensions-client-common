const path = require('path')
// const ExtractTextPlugin = require('extract-text-webpack-plugin')
// const sassImportOnce = require('node-sass-import-once')

module.exports = (baseConfig, env, config) => {
  config.module.rules.push({
    test: /\.(ts|tsx)$/,
    loader: require.resolve('awesome-typescript-loader'),
  })

  config.module.rules.unshift({
    test: /\.scss$/,
    loaders: ['style-loader', 'css-loader', 'sass-loader'],
    include: path.resolve(__dirname, '../'),
  })

  config.resolve.extensions.push('.ts', '.tsx')
  return config
}
