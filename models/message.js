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
      defaultValue: 1
    },
    reply: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    }
  },
  { 
    hooks: {
      // After adding a new message to a conversation, update the updatedAt col to reflect it 
      afterCreate: (m) => {
        Conversation.findOne({ where: { id: m.dataValues.conversationId } })
        .then( c => {
          c.changed('updatedAt', true);
          c.update({ updatedAt: Date.now(), updatedBy: m.dataValues.userId });
        })
      }
    },
    indexes: [
      {
        fields: ['updatedAt']
      }
    ]
  }
);

/**
 * Type:
 *      1 - Comment
 *      2 - Chat
 *      3 - Game Invite
 *      4 - Notification
 *      5 - Broadcast
 */

module.exports = Message;