const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Participant = require('./participant');

const Conversation = sequelize.define('conversation', 
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    title: {
      type: Sequelize.STRING
    },
    updatedBy: {
      type: Sequelize.INTEGER
    }
  },
  { 
    hooks: {
      // After updating a conversation update the corresponding participations for inbox sorting purposes
      afterSave: (c) => {
        Participant.findAll({ where: { conversationId: c.dataValues.id } })
        .then( result => {
          result.map( p => {
            p.changed('updatedAt', true);
            p.update({ updatedAt: Date.now(), hasUpdate: (c.updatedBy != p.userId) });
          })
        })
      }
    }
  }
);

module.exports = Conversation;