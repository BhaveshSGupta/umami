import moment from 'moment-timezone';
import prisma, { runQuery } from 'lib/db';
import { subMinutes } from 'date-fns';
import { MYSQL, POSTGRESQL, MYSQL_DATE_FORMATS, POSTGRESQL_DATE_FORMATS } from 'lib/constants';

export function getDatabase() {
  return (
    process.env.DATABASE_TYPE ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.split(':')[0])
  );
}

export function getDateQuery(db, field, unit, timezone) {
  if (db === POSTGRESQL) {
    if (timezone) {
      return `to_char(date_trunc('${unit}', ${field} at time zone '${timezone}'), '${POSTGRESQL_DATE_FORMATS[unit]}')`;
    }
    return `to_char(date_trunc('${unit}', ${field}), '${POSTGRESQL_DATE_FORMATS[unit]}')`;
  }

  if (db === MYSQL) {
    if (timezone) {
      const tz = moment.tz(timezone).format('Z');

      return `DATE_FORMAT(convert_tz(${field},'+00:00','${tz}'), '${MYSQL_DATE_FORMATS[unit]}')`;
    }

    return `DATE_FORMAT(${field}, '${MYSQL_DATE_FORMATS[unit]}')`;
  }
}

export async function getWebsiteById(website_id) {
  return runQuery(
    prisma.website.findOne({
      where: {
        website_id,
      },
    }),
  );
}

export async function getWebsiteByUuid(website_uuid) {
  return runQuery(
    prisma.website.findOne({
      where: {
        website_uuid,
      },
    }),
  );
}

export async function getWebsiteByShareId(share_id) {
  return runQuery(
    prisma.website.findOne({
      where: {
        share_id,
      },
    }),
  );
}

export async function getUserWebsites(user_id) {
  return runQuery(
    prisma.website.findMany({
      where: {
        user_id,
      },
      orderBy: {
        name: 'asc',
      },
    }),
  );
}

export async function createWebsite(user_id, data) {
  return runQuery(
    prisma.website.create({
      data: {
        account: {
          connect: {
            user_id,
          },
        },
        ...data,
      },
    }),
  );
}

export async function updateWebsite(website_id, data) {
  return runQuery(
    prisma.website.update({
      where: {
        website_id,
      },
      data,
    }),
  );
}

export async function deleteWebsite(website_id) {
  return runQuery(
    /* Prisma bug, does not cascade on non-nullable foreign keys
    prisma.website.delete({
      where: {
        website_id,
      },
    }),
     */
    prisma.$queryRaw`delete from website where website_id=${website_id}`,
  );
}

export async function createSession(website_id, data) {
  return runQuery(
    prisma.session.create({
      data: {
        website: {
          connect: {
            website_id,
          },
        },
        ...data,
      },
      select: {
        session_id: true,
      },
    }),
  );
}

export async function getSessionById(session_id) {
  return runQuery(
    prisma.session.findOne({
      where: {
        session_id,
      },
    }),
  );
}

export async function getSessionByUuid(session_uuid) {
  return runQuery(
    prisma.session.findOne({
      where: {
        session_uuid,
      },
    }),
  );
}

export async function savePageView(website_id, session_id, url, referrer) {
  return runQuery(
    prisma.pageview.create({
      data: {
        website: {
          connect: {
            website_id,
          },
        },
        session: {
          connect: {
            session_id,
          },
        },
        url,
        referrer,
      },
    }),
  );
}

export async function saveEvent(website_id, session_id, url, event_type, event_value) {
  return runQuery(
    prisma.event.create({
      data: {
        website: {
          connect: {
            website_id,
          },
        },
        session: {
          connect: {
            session_id,
          },
        },
        url,
        event_type,
        event_value,
      },
    }),
  );
}

export async function getAccounts() {
  return runQuery(prisma.account.findMany());
}

export async function getAccountById(user_id) {
  return runQuery(
    prisma.account.findOne({
      where: {
        user_id,
      },
    }),
  );
}

export async function getAccountByUsername(username) {
  return runQuery(
    prisma.account.findOne({
      where: {
        username,
      },
    }),
  );
}

export async function updateAccount(user_id, data) {
  return runQuery(
    prisma.account.update({
      where: {
        user_id,
      },
      data,
    }),
  );
}

export async function deleteAccount(user_id) {
  return runQuery(
    /* Prisma bug, does not cascade on non-nullable foreign keys
    prisma.account.delete({
      where: {
        user_id,
      },
    }),
     */
    prisma.$queryRaw`delete from account where user_id=${user_id}`,
  );
}

export async function createAccount(data) {
  return runQuery(
    prisma.account.create({
      data,
    }),
  );
}

export function getMetrics(website_id, start_at, end_at) {
  const db = getDatabase();

  if (db === POSTGRESQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select sum(t.c) as "pageviews",
        count(distinct t.session_id) as "uniques",
        sum(case when t.c = 1 then 1 else 0 end) as "bounces",
        sum(t.time) as "totaltime"
      from (
         select session_id,
           ${getDateQuery(db, 'created_at', 'hour')},
           count(*) c,
           floor(extract(epoch from max(created_at) - min(created_at))) as "time"
         from pageview
         where website_id=$1
         and created_at between $2 and $3
         group by 1, 2
     ) t
     `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  if (db === MYSQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select sum(t.c) as "pageviews",
        count(distinct t.session_id) as "uniques",
        sum(case when t.c = 1 then 1 else 0 end) as "bounces",
        sum(t.time) as "totaltime"
      from (
         select session_id,
           ${getDateQuery(db, 'created_at', 'hour')},
           count(*) c,
           floor(unix_timestamp(max(created_at)) - unix_timestamp(min(created_at))) as "time"
         from pageview
         where website_id=?
         and created_at between ? and ?
         group by 1, 2
     ) t
     `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  return Promise.reject(new Error('Unknown database.'));
}

export function getPageviews(
  website_id,
  start_at,
  end_at,
  timezone = 'utc',
  unit = 'day',
  count = '*',
) {
  const db = getDatabase();

  if (db === POSTGRESQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select ${getDateQuery(db, 'created_at', unit, timezone)} t,
        count(${count}) y
      from pageview
      where website_id=$1
      and created_at between $2 and $3
      group by 1
      order by 1
      `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  if (db === MYSQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select ${getDateQuery(db, 'created_at', unit, timezone)} t,
        count(${count}) y
      from pageview
      where website_id=?
      and created_at between ? and ?
      group by 1
      order by 1
      `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  return Promise.reject(new Error('Unknown database.'));
}

export function getRankings(website_id, start_at, end_at, type, table, domain) {
  const db = getDatabase();

  const filter = domain ? `and ${type} not like '%${domain}%'` : '';

  if (db === POSTGRESQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select distinct ${type} x, count(*) y
      from ${table}
      where website_id=$1
      and created_at between $2 and $3
      ${filter}
      group by 1
      order by 2 desc
      `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  if (db === MYSQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select distinct ${type} x, count(*) y
      from ${table}
      where website_id=?
      and created_at between ? and ?
      ${filter}
      group by 1
      order by 2 desc
      `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  return Promise.reject(new Error('Unknown database.'));
}

export function getActiveVisitors(website_id) {
  const db = getDatabase();
  const date = subMinutes(new Date(), 5);

  if (db === POSTGRESQL) {
    return runQuery(
      prisma.$queryRaw(
        `
    select count(distinct session_id) x
    from pageview
    where website_id=$1
    and created_at >= $2
    `,
        website_id,
        date,
      ),
    );
  }

  if (db === MYSQL) {
    return runQuery(
      prisma.$queryRaw(
        `
    select count(distinct session_id) x
    from pageview
    where website_id=?
    and created_at >= ?
    `,
        website_id,
        date,
      ),
    );
  }

  return Promise.reject(new Error('Unknown database.'));
}

export function getEvents(website_id, start_at, end_at, timezone = 'utc', unit = 'day') {
  const db = getDatabase();

  if (db === POSTGRESQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select
        event_value x,
        ${getDateQuery(db, 'created_at', unit, timezone)} t,
        count(*) y
      from event
      where website_id=$1
      and created_at between $2 and $3
      group by 1, 2
      order by 2
      `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  if (db === MYSQL) {
    return runQuery(
      prisma.$queryRaw(
        `
      select
        event_value x,
        ${getDateQuery(db, 'created_at', unit, timezone)} t,
        count(*) y
      from event
      where website_id=?
      and created_at between ? and ?
      group by 1, 2
      order by 2
      `,
        website_id,
        start_at,
        end_at,
      ),
    );
  }

  return Promise.reject(new Error('Unknown database.'));
}
