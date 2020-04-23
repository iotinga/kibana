/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { left, right } from './either';
import { always, id, noop } from './utils';

const maybeTotal = x => (x === 'total' ? left(x) : right(x));

export const trimLeftFrom = (text, x) => x.replace(new RegExp(`(?:.*)(${text}.*$)`, 'gm'), '$1');

export const statsAndstaticSiteUrl = (...xs) => {
  const [staticSiteUrl] = xs[0][1];
  const [stats] = xs[0];
  return {
    staticSiteUrl,
    ...stats,
  };
};

export const addJsonSummaryPath = jsonSummaryPath => obj => ({
  jsonSummaryPath: trimLeftFrom('target', jsonSummaryPath),
  ...obj,
});

export const truncate = text => obj => {
  const { staticSiteUrl } = obj;
  if (staticSiteUrl.includes(text)) obj.staticSiteUrl = trimLeftFrom(text, staticSiteUrl);
  return obj;
};

export const addTimeStamp = ts => obj => ({
  ...obj,
  '@timestamp': ts,
});

const splitOnRoot = root => x => x.split(root)[1];
const setTotal = x => obj => (obj.isTotal = x);
const mutateTrue = setTotal(true);
const mutateFalse = setTotal(false);

const root = urlBase => ts => testRunnerType =>
  `${urlBase}/${ts}/${testRunnerType.toLowerCase()}-combined`;

const prokForTotalsIndex = mutateTrue => urlRoot => obj =>
  right(obj)
    .map(mutateTrue)
    .map(always(`${urlRoot}/index.html`))
    .fold(noop, id);

const prokForCoverageIndex = root => mutateFalse => urlRoot => obj => siteUrl =>
  right(siteUrl)
    .map(x => {
      mutateFalse(obj);
      return x;
    })
    .map(x => {
      return splitOnRoot(root)(x);
    })
    .map(x => `${urlRoot}${x}.html`)
    .fold(noop, id);

export const staticSite = urlBase => obj => {
  const { staticSiteUrl, testRunnerType, COVERAGE_INGESTION_KIBANA_ROOT } = obj;
  const ts = obj['@timestamp'];
  const urlRoot = root(urlBase)(ts)(testRunnerType);
  const prokTotal = prokForTotalsIndex(mutateTrue)(urlRoot);
  const prokCoverage = prokForCoverageIndex(COVERAGE_INGESTION_KIBANA_ROOT)(mutateFalse)(urlRoot)(
    obj
  );
  const prokForBoth = always(maybeTotal(staticSiteUrl).fold(always(prokTotal(obj)), prokCoverage));

  return { ...obj, staticSiteUrl: prokForBoth() };
};

export const coveredFilePath = obj => {
  const { staticSiteUrl, COVERAGE_INGESTION_KIBANA_ROOT } = obj;

  const withoutCoveredFilePath = always(obj);
  const leadingSlashRe = /^\//;
  const maybeDropLeadingSlash = x => (leadingSlashRe.test(x) ? right(x) : left(x));
  const dropLeadingSlash = x => x.replace(leadingSlashRe, '');
  const dropRoot = root => x =>
    maybeDropLeadingSlash(splitOnRoot(root)(x)).fold(id, dropLeadingSlash);
  return maybeTotal(staticSiteUrl)
    .map(dropRoot(COVERAGE_INGESTION_KIBANA_ROOT))
    .fold(withoutCoveredFilePath, coveredFilePath => ({ ...obj, coveredFilePath }));
};

export const ciRunUrl = obj => {
  const ciRunUrl = process.env.CI_RUN_URL || 'CI RUN URL NOT PROVIDED';

  return {
    ...obj,
    ciRunUrl,
  };
};

const dropAfter = size => x => {
  return x.slice(0, size);
};

const truncateCommitMsg = x => {
  const size = 50;
  const dropAfterSize = dropAfter(size);
  const trunkd = x.length > 50 ? `${dropAfterSize(x)}...` : x;
  return trunkd;
};

export const itemizeVcs = vcsInfo => obj => {
  // const [previousSha, branch, sha, author, commitMsg] = vcsInfo;
  const [branch, sha, author, commitMsg] = vcsInfo;
  return {
    ...obj,
    vcs: {
      branch,
      sha,
      author,
      commitMsg: truncateCommitMsg(commitMsg),
      vcsCommitUrl: `https://github.com/elastic/kibana/commit/${sha}`,
      // vcsCompareUrl: `https://github.com/elastic/kibana/compare/${previousSha}...${sha}`,
    },
  };
};
export const testRunner = obj => {
  const { jsonSummaryPath } = obj;

  let testRunnerType = 'other';

  const upperTestRunnerType = x => {
    if (jsonSummaryPath.includes(x)) {
      testRunnerType = x.toUpperCase();
      return;
    }
  };

  ['mocha', 'jest', 'functional'].forEach(upperTestRunnerType);

  return {
    testRunnerType,
    ...obj,
  };
};

export const buildId = obj => {
  const { env } = process;
  if (env.BUILD_ID) obj.BUILD_ID = env.BUILD_ID;

  return {
    ...obj,
  };
};
