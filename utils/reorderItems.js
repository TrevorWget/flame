const { sequelize } = require('../db');

const reorderItems = async (Model, items) => {
  await sequelize.transaction(async (transaction) => {
    for (const { id, orderId } of items) {
      await Model.update({ orderId }, { where: { id }, transaction });
    }
  });
};

module.exports = reorderItems;
