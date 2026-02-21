const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: {
      main: "./public/js/script.js",
      loader: "./public/js/loader.js",
      details: "./public/js/details.js",
      orderConfirm: "./public/js/order-confirm.js",
      adminDashboard: "./public/js/admin-dashboard.js",
      adminMessages: "./public/js/admin-messages.js",
      userMessages: "./public/js/user-messages.js",
      faq: "./public/js/faq.js",
      adminTheme: "./public/js/admin-theme.js",
    },
    output: {
      path: path.resolve(__dirname, "public", "dist", "js"),
      filename: "[name].bundle.js",
      clean: true,
    },
    devtool: isProd ? false : "source-map",
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "../css/[name].bundle.css",
      }),
    ],
    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },
    performance: {
      hints: false,
    },
    stats: "minimal",
  };
};
