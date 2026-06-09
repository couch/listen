const GH_API = 'https://api.github.com';

function makeHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(url, headers, opts = {}) {
  const res = await fetch(url, { headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `GitHub ${res.status} — ${opts.method || 'GET'} ${url}`);
  return data;
}

export async function githubCommit(files, message, { token, owner, repo, branch }, onProgress) {
  const base = `${GH_API}/repos/${owner}/${repo}`;
  const headers = makeHeaders(token);

  onProgress?.('connecting…');
  const refData = await ghFetch(`${base}/git/refs/heads/${branch}`, headers);
  const latestSha = refData.object.sha;
  const { tree: { sha: treeSha } } = await ghFetch(`${base}/git/commits/${latestSha}`, headers);

  onProgress?.('uploading files…');
  const treeItems = await Promise.all(files.map(async ({ path, content }) => {
    const { sha } = await ghFetch(`${base}/git/blobs`, headers, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    });
    return { path, mode: '100644', type: 'blob', sha };
  }));

  const { sha: newTreeSha } = await ghFetch(`${base}/git/trees`, headers, {
    method: 'POST',
    body: JSON.stringify({ base_tree: treeSha, tree: treeItems }),
  });

  onProgress?.('committing…');
  const { sha: newCommitSha } = await ghFetch(`${base}/git/commits`, headers, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTreeSha, parents: [latestSha] }),
  });

  onProgress?.('pushing…');
  const refRes = await fetch(`${base}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommitSha }),
  });
  if (refRes.status === 422) throw new Error('Save conflict — a newer change exists remotely. Reload and try again.');
  if (!refRes.ok) {
    const d = await refRes.json().catch(() => ({}));
    throw new Error(d.message || `GitHub ${refRes.status}`);
  }
}

export async function githubDeleteFile(filePath, message, { token, owner, repo, branch }) {
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = makeHeaders(token);

  const getRes = await fetch(`${url}?ref=${branch}`, { headers });
  if (!getRes.ok) return;
  const { sha } = await getRes.json();
  await fetch(url, { method: 'DELETE', headers, body: JSON.stringify({ message, sha, branch }) });
}
