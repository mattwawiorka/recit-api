const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Message = sequelize.define('message', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  content: {
    type: Sequelize.STRING,
    allowNull: false
  },
  author: {
    type: Sequelize.STRING,
    allowNull: false
  }
});

module.exports = Message;