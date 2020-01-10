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
  },
  type: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: "1"
  }
});

/**
 * Type:
 *      1 - Message
 *      2 - Comment
 *      3 - Game Invite
 *      4 - Notification
 *      5 - Broadcast
 */

module.exports = Message;