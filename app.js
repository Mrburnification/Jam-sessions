// GitHub configuration
const GITHUB_USER = 'Mrburnification';
const REPO_NAME = 'Jam-sessions';
const AUDIO_BASE_URL = `https://${GITHUB_USER}.github.io/${REPO_NAME}/audio`;
const USE_MOCK_DATA = false; // Flag to toggle between real and mock data

// Audio system variables
let audio;
let analyser;
let animationId;
let progressInterval;
let p5sketch;
let audioCompressor;
let waveformCanvas, waveformCtx;

// DOM elements
const container = document.getElementById('sessions-list');
const playPauseBtn = document.getElementById('play-pause');
const progressBar = document.getElementById('progress');
const progressContainer = document.querySelector('.progress-container');
let waveformContainer;

// Initialize the application
function initApp() {
    initWaveform();
    setupVisualizer();
    initEventListeners();
    populateSessions();
    showContent();
}

// Waveform functions
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

// UI functions
function showContent() {
    document.body.classList.add('content-loaded');
}

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

// Audio visualizer functions
function initVisualizer() {
    try {
        const audioContext = Howler.ctx;
        
        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            Howler.masterGain.connect(analyser);
        }
        
        if (!waveformCtx && waveformContainer) {
            initWaveform();
        }
    } catch (error) {
        console.error("Visualizer error:", error);
    }
}

function drawWaveform() {
    if (!analyser || !waveformCtx || !waveformCanvas) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    
    const barWidth = (waveformCanvas.width / bufferLength) * 2.5;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * waveformCanvas.height;
        waveformCtx.fillStyle = `hsl(${i/bufferLength * 360}, 100%, 50%)`;
        waveformCtx.fillRect(x, waveformCanvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

// Time formatting
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
    
    if (waveformCtx && waveformCanvas) {
        drawWaveform();
    }
}

// Data fetching functions
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

async function fetchMockSessions() {
    try {
        const response = await fetch('mockSessions.json');
        return response.ok ? await response.json() : [];
    } catch (error) {
        console.error('Mock fetch error:', error);
        return [];
    }
}

async function getSessions() {
    if (USE_MOCK_DATA) {
        return fetchMockSessions();
    }

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

// Session population
async function populateSessions() {
    if (!container) return;
    
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
                        <li class="track-item" data-src="${track.url}" tabindex="0">
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

    // Initialize track durations
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

// Event handlers
function handleTrackClick(e) {
    const trackItem = e.target.closest('.track-item');
    if (!trackItem || trackItem.classList.contains('processing')) return;
    
    trackItem.classList.add('processing');
    
    const src = trackItem.dataset.src;
    const titleElement = trackItem.querySelector('.track-title');
    const originalTitle = titleElement.textContent.replace(' (playing)', '');
    
    document.querySelectorAll('.track-item').forEach(t => {
        t.classList.remove('playing');
    });
    
    trackItem.classList.add('playing');
    document.getElementById('current-track').textContent = originalTitle;

    if (audio && typeof audio.stop === 'function') {
        audio.stop();
    }
    
    audio = new Howl({
        src: [src],
        html5: true,
        format: [src.split('.').pop()],
        onplay: () => {
            playPauseBtn.textContent = '⏸';
            initVisualizer();
            progressInterval = setInterval(updateProgress, 100);
            setTimeout(() => trackItem.classList.remove('processing'), 300);
        },
        onend: () => {
            resetPlaybackState();
            trackItem.classList.remove('processing');
        },
        onstop: () => {
            resetPlaybackState();
            trackItem.classList.remove('processing');
        },
        onpause: () => {
            playPauseBtn.textContent = '▶';
            trackItem.classList.remove('processing');
        },
        onloaderror: () => {
            trackItem.classList.remove('processing');
        }
    });
    audio.play();
}

function initEventListeners() {
    // Play/Pause button
    playPauseBtn.addEventListener('click', function() {
        if (!audio || this.classList.contains('processing')) return;
        
        this.classList.add('processing');
        
        if (audio.playing()) {
            audio.pause();
        } else {
            audio.play();
        }
        
        setTimeout(() => this.classList.remove('processing'), 300);
    });

    // Progress bar seeking
    progressContainer.addEventListener('click', (e) => {
        if (!audio) return;
        const rect = progressContainer.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const newTime = (offsetX / rect.width) * audio.duration();
        audio.seek(newTime);
        updateProgress();
    });

    // Track selection
    const debouncedHandleTrackClick = debounce(handleTrackClick, 300);
    if (container) {
        container.addEventListener('click', debouncedHandleTrackClick);
        
        // Touch events for mobile
        let touchStartY;
        container.addEventListener('touchstart', function(e) {
            touchStartY = e.touches[0].clientY;
            const trackItem = e.target.closest('.track-item');
            if (trackItem) trackItem.classList.add('touch-active');
        }, { passive: true });

        container.addEventListener('touchend', function(e) {
            const trackItem = e.target.closest('.track-item');
            if (trackItem) trackItem.classList.remove('touch-active');
            
            if (typeof touchStartY !== 'undefined') {
                const touchEndY = e.changedTouches[0].clientY;
                if (Math.abs(touchEndY - touchStartY) < 10) {
                    debouncedHandleTrackClick(e);
                }
            }
        }, { passive: true });
    }

    // Window resize
    window.addEventListener('resize', () => {
        updateWaveformSize();
        if (p5sketch) p5sketch.resizeCanvas(window.innerWidth, window.innerHeight);
    });

    // Prevent text selection
    document.addEventListener('selectstart', function(e) {
        if (!e.target.classList.contains('allow-select')) {
            e.preventDefault();
        }
    });

    // Prevent iOS touch highlighting
    document.addEventListener('touchstart', function() {}, { passive: true });
}

// Background visualizer
function setupVisualizer() {
    p5sketch = new p5((p) => {
        let bassEnergy = 0, midEnergy = 0, trebleEnergy = 0;
        
        p.setup = () => {
            const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
            canvas.class('background-visualization');
            p.colorMode(p.HSB);
            p.noStroke();
        };

        p.draw = () => {
            p.background(0, 0.05);
            
            if (!audio || !audio.playing()) return;
            
            if (analyser) {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                
                bassEnergy = dataArray.slice(0, 20).reduce((a,b) => a + b, 0) / 2000;
                midEnergy = dataArray.slice(20, 100).reduce((a,b) => a + b, 0) / 8000;
                trebleEnergy = dataArray.slice(100).reduce((a,b) => a + b, 0) / 15000;
            }
            
            const energy = bassEnergy * 0.6 + midEnergy * 0.3 + trebleEnergy * 0.1;
            const baseSize = p.map(energy, 0, 1, 50, 400);
            const pulse = p.sin(p.frameCount * 0.05) * 50;
            
            p.fill(120, 100, 100, 0.1);
            p.ellipse(p.width/2, p.height/2, baseSize + pulse);
            
            p.fill(200, 100, 100, 0.1);
            p.ellipse(p.width/2, p.height/2, baseSize * 0.7 + pulse * 0.8);
        };
    });
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);