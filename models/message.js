const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Conversation = require('./conversation');

const Message = sequelize.define('message', 
  {
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
    },
  },
  { hooks: {
      afterCreate: (m) => {
        Conversation.findOne({ where: { id: m.dataValues.conversationId } })
        .then( c => {
          c.changed('updatedAt', true);
          c.update({ updatedAt: Date.now() });
        })
      }
    }
  }
);

/**
 * Type:
 *      1 - Message
 *      2 - Comment
 *      3 - Game Invite
 *      4 - Notification
 *      5 - Broadcast
 */

module.exports = Message;