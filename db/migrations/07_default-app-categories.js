const { QueryTypes } = require('sequelize');
const Logger = require('../../utils/Logger');
const logger = new Logger();

// Upstream Flame (pawelmalak, <= v2.4.0) has no app categories, so 05_app-categories
// leaves every existing app on categoryId -1. The UI only shows apps that belong to an
// app category, so those apps would be invisible. Pinned apps go to a pinned category
// (home page + /applications) and unpinned ones to an unpinned category
// (/applications only), which keeps upstream's home page as it was.
const GROUPS = [
  { name: 'Applications', isPinned: 1, where: 'isPinned = 1' },
  {
    name: 'Other apps',
    isPinned: 0,
    where: '(isPinned IS NULL OR isPinned != 1)',
  },
];

const ORPHAN = `(categoryId IS NULL OR categoryId NOT IN (SELECT id FROM categories WHERE type = 'apps'))`;

const up = async (query) => {
  const { sequelize } = query;

  await sequelize.transaction(async (transaction) => {
    const run = (sql, replacements = {}, type = QueryTypes.SELECT) =>
      sequelize.query(sql, { type, replacements, transaction });

    for (const { name, isPinned, where } of GROUPS) {
      const [{ count }] = await run(
        `SELECT COUNT(*) AS count FROM apps WHERE ${ORPHAN} AND ${where}`
      );

      if (count === 0) continue;

      // Reuse an app category of the same name so a re-run never adds duplicates
      const [existing] = await run(
        `SELECT id FROM categories WHERE type = 'apps' AND name = :name ORDER BY id LIMIT 1`,
        { name }
      );
      let categoryId = existing?.id;

      if (!categoryId) {
        const now = new Date();
        [categoryId] = await run(
          `INSERT INTO categories (name, type, isPinned, orderId, isPublic, createdAt, updatedAt)
           VALUES (:name, 'apps', :isPinned, NULL, 1, :now, :now)`,
          { name, isPinned, now },
          QueryTypes.INSERT
        );
      }

      await run(
        `UPDATE apps SET categoryId = :categoryId WHERE ${ORPHAN} AND ${where}`,
        { categoryId },
        QueryTypes.UPDATE
      );

      logger.log(
        `Moved ${count} uncategorized app(s) into the "${name}" app category`
      );
    }
  });
};

// Moved apps keep their new category; there is nothing safe to undo
const down = async () => {};

module.exports = {
  up,
  down,
};
