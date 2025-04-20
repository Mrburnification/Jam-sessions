// GitHub configuration
const GITHUB_USER = 'Mrburnification';
const REPO_NAME = 'Jam-sessions';
const AUDIO_BASE_URL = `https://${GITHUB_USER}.github.io/${REPO_NAME}/audio`;

// Audio system variables
let audio;
let analyser;
let animationId;
let progressInterval;
let p5sketch;
let audioCompressor;
let waveformCanvas, waveformCtx;

// DOM elements
const playPauseBtn = document.getElementById('play-pause');
const progressBar = document.getElementById('progress');
const progressContainer = document.querySelector('.progress-container');
let waveformContainer;

// Initialize waveform canvas - now with null check
function initWaveform() {
    waveformContainer = document.querySelector('.waveform-container');
    if (!waveformContainer) {
        console.error('Waveform container not found!');
        return;
    }
    
    waveformCanvas = document.createElement('canvas');
    waveformCtx = waveformCanvas.getContext('2d');
    waveformCanvas.className = 'waveform-canvas';
    waveformContainer.appendChild(waveformCanvas);
    updateWaveformSize();
}

function updateWaveformSize() {
    if (waveformCanvas && progressContainer) {
        waveformCanvas.width = progressContainer.offsetWidth;
        waveformCanvas.height = progressContainer.offsetHeight;
    }
}

// Modified initialization to wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    initWaveform();
    setupVisualizer();
    
    window.addEventListener('resize', () => {
        updateWaveformSize();
        if (p5sketch) p5sketch.resizeCanvas(window.innerWidth, window.innerHeight);
    });

    playPauseBtn.addEventListener('click', () => {
        if (!audio) return;
        audio.playing() ? audio.pause() : audio.play();
    });

    // Start loading content
    populateSessions();
});

// Resize handlers
window.addEventListener('resize', () => {
    updateWaveformSize();
    if (p5sketch) p5sketch.resizeCanvas(window.innerWidth, window.innerHeight);
});

// Audio visualizer initialization
function initVisualizer() {
    try {
        const audioContext = Howler.ctx;
        
        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.8;
        }

        if (!audioCompressor) {
            audioCompressor = audioContext.createDynamicsCompressor();
            audioCompressor.threshold.value = -30;
            audioCompressor.knee.value = 40;
            audioCompressor.ratio.value = 20;
            audioCompressor.attack.value = 0.01;
            audioCompressor.release.value = 0.25;
            audioCompressor.connect(audioContext.destination);
        }

        Howler.masterGain.disconnect();
        Howler.masterGain.connect(analyser);
        Howler.masterGain.connect(audioCompressor);
        
        const canvas = document.querySelector('.background-visualization');
        if (canvas) canvas.style.opacity = '0.7';
    } catch (error) {
        console.error("Visualizer error:", error);
    }
}

// Progress and waveform functions
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function updateProgress() {
    if (!audio || !audio.playing()) return;
    
    const seek = audio.seek() || 0;
    const duration = audio.duration() || 1;
    const progress = (seek / duration) * 100;
    
    progressBar.style.width = `${progress}%`;
    document.getElementById('current-time').textContent = formatTime(seek);
    drawWaveform();
}

function drawWaveform() {
    if (!analyser || !waveformCtx) return;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    
    const barWidth = (waveformCanvas.width / dataArray.length) * 2.5;
    let x = 0;
    
    dataArray.forEach(value => {
        const height = (value / 255) * waveformCanvas.height;
        const gradient = waveformCtx.createLinearGradient(0, 0, 0, waveformCanvas.height);
        gradient.addColorStop(0, '#1db954');
        gradient.addColorStop(1, '#14833b');
        
        waveformCtx.fillStyle = gradient;
        waveformCtx.fillRect(x, waveformCanvas.height - height, barWidth, height);
        x += barWidth + 1;
    });
}

// Session data handling
async function fetchDirectory(path) {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${path}`
        );
        return response.ok ? await response.json() : [];
    } catch (error) {
        console.error('Fetch error:', error);
        return [];
    }
}

// Fetch comment.txt from session directory
async function getSessionComment(dateDir) {
    try {
        const files = await fetchDirectory(dateDir.path);
        const commentFile = files.find(file => file.name.toLowerCase() === 'comment.txt');
        
        if (commentFile && commentFile.download_url) {
            const response = await fetch(commentFile.download_url);
            if (response.ok) {
                return await response.text();
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting comment:', error);
        return null;
    }
}

async function getSessions() {
    try {
        const dates = await fetchDirectory('audio');
        const sessions = [];
        
        for (const dateDir of dates.filter(d => d.type === 'dir')) {
            const tracks = await fetchDirectory(dateDir.path);
            const validTracks = tracks
                .filter(t => t.name.match(/\.(mp3|m4a)$/i))
                .map(t => ({
                    title: t.name.replace(/\..+$/, ''),
                    url: `${AUDIO_BASE_URL}/${dateDir.name}/${t.name}`
                }));
            
            if (validTracks.length > 0) {
                sessions.push({
                    date: dateDir.name,
                    tracks: validTracks,
                    comment: await getSessionComment(dateDir)
                });
            }
        }
        
        return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
        console.error('Session error:', error);
        return [];
    }
}

// Player controls
function resetPlaybackState() {
    playPauseBtn.textContent = '▶';
    clearInterval(progressInterval);
    progressBar.style.width = '0%';
    document.querySelectorAll('.track-item').forEach(track => {
        track.classList.remove('playing');
        const title = track.querySelector('.track-title');
        title.textContent = title.textContent.replace(' (playing)', '');
    });
}

// Session population
async function populateSessions() {
    const container = document.getElementById('sessions-list');
    container.innerHTML = '<div class="loading">Loading sessions...</div>';
    
    const sessions = await getSessions();
    container.innerHTML = '';
    
    sessions.forEach(session => {
        const sessionHTML = `
            <div class="session-card">
                <div class="session-date">
                    ${new Date(session.date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}
                </div>
                ${session.comment ? `<div class="session-comment">${session.comment}</div>` : ''}
                <ul class="track-list">
                    ${session.tracks.map(track => `
                        <li class="track-item" data-src="${track.url}">
                            <div class="track-info">
                                <span class="play-icon">▶</span>
                                <span class="track-title">${track.title}</span>
                            </div>
                            <span class="track-duration">0:00</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', sessionHTML);
    });

    // Event handling
    container.addEventListener('click', handleTrackClick);
    container.addEventListener('touchstart', handleTrackClick);

    function handleTrackClick(e) {
        const trackItem = e.target.closest('.track-item');
        if (!trackItem) return;
        
        const src = trackItem.dataset.src;
        const titleElement = trackItem.querySelector('.track-title');
        const originalTitle = titleElement.textContent.replace(' (playing)', '');
        
        // Update track states
        document.querySelectorAll('.track-item').forEach(t => {
            t.classList.remove('playing');
            t.querySelector('.track-title').textContent = 
                t.querySelector('.track-title').textContent.replace(' (playing)', '');
        });
        
        trackItem.classList.add('playing');
        titleElement.textContent = `${originalTitle} (playing)`;

        // Audio handling
        if (audio) audio.stop();
        audio = new Howl({
            src: [src],
            html5: true,
            format: [src.split('.').pop()],
            onplay: () => {
                playPauseBtn.textContent = '⏸';
                initVisualizer();
                progressInterval = setInterval(updateProgress, 100);
            },
            onend: resetPlaybackState,
            onstop: resetPlaybackState,
            onpause: () => playPauseBtn.textContent = '▶'
        }).play();
    }

    // Initialize time displays
    document.querySelectorAll('.track-item').forEach(item => {
        new Howl({
            src: [item.dataset.src],
            onload: function() {
                item.querySelector('.track-duration').textContent = 
                    formatTime(this.duration());
            }
        });
    });
}

// Background visualizer
function setupVisualizer() {
    p5sketch = new p5((p) => {
        let bassEnergy = 0, midEnergy = 0, trebleEnergy = 0;
        
        p.setup = () => {
            p.createCanvas(window.innerWidth, window.innerHeight)
                .class('background-visualization')
                .style('position', 'fixed');
            p.colorMode(p.HSB);
            p.noStroke();
        };

        p.draw = () => {
            p.background(0, 0.05);
            if (!audio || !audio.playing()) return;
            
            // Calculate energy levels
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            
            bassEnergy = dataArray.slice(0, 20).reduce((a,b) => a + b, 0) / 2000;
            midEnergy = dataArray.slice(20, 100).reduce((a,b) => a + b, 0) / 8000;
            trebleEnergy = dataArray.slice(100).reduce((a,b) => a + b, 0) / 15000;

            // Dynamic circles
            const baseSize = p.map(bassEnergy + midEnergy + trebleEnergy, 0, 3, 50, 400);
            p.fill(29, 185, 84, 0.1);
            p.ellipse(p.width/2, p.height/2, baseSize + p.sin(p.frameCount * 0.1) * 50);
            p.ellipse(p.width/2, p.height/2, baseSize * 0.8 + p.cos(p.frameCount * 0.08) * 40);
        };
    });
}

// Initialization
window.addEventListener('load', async () => {
    initWaveform();
    setupVisualizer();
    await populateSessions();
    
    playPauseBtn.addEventListener('click', () => {
        if (!audio) return;
        audio.playing() ? audio.pause() : audio.play();
    });
});