// We compute queue times by looking at a snapshot of jobs in CI that are
// currently queued and seeing how long they've existed. This approach doesn't
// give us historical data, so write our snapshot regularly to another Rockset
// collection so we can get a view of the queue over time.
import rockset from "@rockset/client";
import { promises as fs } from "fs";

const client = rockset.default(process.env.ROCKSET_API_KEY);

function getRoundedDate(minutes, d=new Date()) {
  console.log(d);
  let ms = 1000 * 60 * minutes;
  let roundedDate = new Date(Math.floor(d.getTime() / ms) * ms);
  return roundedDate
}

function minutesDelta(d, delta) {
  return new Date(new Date(d).getTime() + delta * 60 * 1000);
}

async function get_oldest_incomplete_data() {
  const oldest_incomplete_data_result = await client.queries.query({
    sql: {
      query: `
        SELECT
          MIN(q.reference_time) AS reference_time
        FROM
          metrics.queue_times_historical_ng q
        WHERE
          q.fully_computed != true
      `,
    },
  });
  let oldest_incomplete_data = oldest_incomplete_data_result.results.lenght ? oldest_incomplete_data_result.results[0]['reference_time'] : null;
  if (oldest_incomplete_data === null) {
    const oldest_job_data_result = await client.queries.query({
      sql: {
        query: `
          SELECT
            MIN(job._event_time) AS reference_time
          FROM
            commons.workflow_job job
        `,
      },
    });
    oldest_incomplete_data = oldest_job_data_result.results[0]['reference_time'];
  }
  return getRoundedDate(1, new Date(Date.parse(oldest_incomplete_data)));
}

async function check_have_incomplete_jobs(date) {
  const have_incomplete_jobs_result = await client.queries.query({
    sql: {
      query: `
        SELECT
          COUNT(*) AS count
        FROM
          commons.workflow_job job
          JOIN commons.workflow_run workflow ON workflow.id = job.run_id
        WHERE
          job.created_at > '${date.toISOString()}'
          AND job.created_at <= '${minutesDelta(date, 1).toISOString()}'
          AND job.status = 'queued'
          AND workflow.status != 'completed'
          AND job.completed_at IS NULL
          AND LENGTH(job.steps) = 0
      `,
    },
  });
  return have_incomplete_jobs_result.results[0]['count'] > 0;
}

async function get_completed_jobs_stats() {
  const completed_jobs_stats_result = await client.queries.query({
    sql: {
      query: `
        WITH queued_jobs as (
          SELECT
            DATE_DIFF(
              'second',
              job.created_at,
              job.completed_at
            ) AS queue_s,
            CONCAT(workflow.name, ' / ', job.name) AS name,
            job.html_url,
            IF(
              LENGTH(job.labels) = 0,
              'N/A',
              IF(
                LENGTH(job.labels) > 1,
                ELEMENT_AT(job.labels, 2),
                ELEMENT_AT(job.labels, 1)
              )
            ) AS machine_type,
          FROM
            commons.workflow_job job
            JOIN commons.workflow_run workflow ON workflow.id = job.run_id
          WHERE
            workflow.repository.full_name = 'pytorch/pytorch'
            AND job.status = 'queued'
            AND job._event_time < (
              CURRENT_TIMESTAMP() - INTERVAL 5 MINUTE
            )
            /* These two conditions are workarounds for GitHub's broken API. Sometimes */
            /* jobs get stuck in a permanently "queued" state but definitely ran. We can */
            /* detect this by looking at whether any steps executed (if there were, */
            /* obviously the job started running), and whether the workflow was marked as */
            /* complete (somehow more reliable than the job-level API) */
            AND LENGTH(job.steps) = 0
            AND workflow.status != 'completed'
          ORDER BY
            queue_s DESC
        )
        SELECT
          COUNT(*) AS count,
          MAX(queue_s) AS max_queue_s,
          machine_type,
        FROM
          queued_jobs
        GROUP BY
          machine_type
        ORDER BY
          count DESC
      `,
    },
  });
  return completed_jobs_stats_result.results[0];
}

async function main() {
  let check_date = get_oldest_incomplete_data();
  const now = getRoundedDate(1);
  const before_yesterday = minutesDelta(now, -60 * 24 * 2);
  let maxEntries = 1000;

  while (check_date < now && maxEntries > 0) {
    console.log(`Checking ${check_date.toISOString()} for incomplete jobs`);
    if (check_date > before_yesterday && check_have_incomplete_jobs(check_date)) {
      console.log(`Found incomplete jobs for ${check_date.toISOString()}`);
      break;
    }


  }

  console.log(oldest_incomplete_data);
}

await main();
