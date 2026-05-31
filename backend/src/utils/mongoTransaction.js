"use strict";

async function runInMongoTransaction(models, work) {
  const sessionFactory = getSessionFactory(models);

  if (!sessionFactory) {
    return work(null);
  }

  const session = await sessionFactory();

  if (!session || typeof session.withTransaction !== "function") {
    return work(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    if (typeof session.endSession === "function") {
      await session.endSession();
    }
  }
}

function getSessionFactory(models) {
  if (typeof models?.startSession === "function") {
    return models.startSession;
  }

  const model = models?.Plan ?? models?.GymState ?? models?.GymData ?? models?.Session;

  if (typeof model?.db?.startSession === "function") {
    return model.db.startSession.bind(model.db);
  }

  return null;
}

module.exports = { runInMongoTransaction };
