// Replace these with your GitHub details
const GITHUB_USER = 'your-github-username';
const REPO_NAME = 'your-repo-name';
const AUDIO_BASE_URL = `https://${GITHUB_USER}.github.io/${REPO_NAME}/audio`;

const audio = new Howl({
    src: [],
    onplay: () => {
        // Start visualizer when audio plays
        visualize();
    }
});

async function fetchDirectory(path) {
    const response = await fetch(
        `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${path}`
    );
    return await response.json();
}

async function getSessions() {
    try {
        const sessions = [];
        const dates = await fetchDirectory('audio');

        for (const dateDir of dates.filter(d => d.type === 'dir')) {
            const tracks = await fetchDirectory(dateDir.path);
            const validTracks = tracks.filter(t => t.name.endsWith('.mp3')).map(track => ({
                title: track.name.replace('.mp3', ''),
                url: `${AUDIO_BASE_URL}/${dateDir.name}/${track.name}`
            }));

            if (validTracks.length > 0) {
                sessions.push({
                    date: dateDir.name,
                    tracks: validTracks
                });
            }
        }

        return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
        console.error('Error loading sessions:', error);
        return [];
    }
}

async function populateSessions() {
    const container = document.getElementById('sessions-list');
    container.innerHTML = '<div class="loading">Loading sessions...</div>';

    const sessions = await getSessions();
    container.innerHTML = '';

    sessions.forEach(session => {
        const sessionElement = document.createElement('div');
        sessionElement.className = 'session-card';
        sessionElement.innerHTML = `
            <div class="session-date">${new Date(session.date).toLocaleDateString()}</div>
            <ul class="track-list">
                ${session.tracks.map(track => `
                    <li class="track-item" data-src="${track.url}">
                        <span>▶</span>
                        <span>${track.title}</span>
                    </li>
                `).join('')}
            </ul>
        `;
        container.appendChild(sessionElement);
    });

    // Add track click handlers
    document.querySelectorAll('.track-item').forEach(item => {
        item.addEventListener('click', () => {
            const src = item.dataset.src;
            const title = item.lastElementChild.textContent;
            document.getElementById('current-track').textContent = title;
            audio.src = [src];
            audio.play();
            document.getElementById('play-pause').textContent = '⏸';
        });
    });
}

function visualize() {
    // Basic visualizer logic (placeholder)
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    // Visualization code goes here
}

window.onload = populateSessions;