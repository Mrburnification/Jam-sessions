// GitHub configuration
const GITHUB_USER = 'Mrburnification';
const REPO_NAME = 'Jam-sessions';
const AUDIO_BASE_URL = `https://${GITHUB_USER}.github.io/${REPO_NAME}/audio`;

// Audio player and visualizer variables
let audio;
let analyser;
let animationId;
let progressInterval;
let p5sketch;
let circles = [];
let hue = 1;
let audioData = new Uint8Array(1024);

// DOM elements
const playPauseBtn = document.getElementById('play-pause');
const volumeControl = document.getElementById('volume');
const progressBar = document.getElementById('progress');
const progressContainer = document.querySelector('.progress-container');
const progressDot = document.createElement('div');
progressDot.className = 'progress-dot';
progressBar.appendChild(progressDot);

// Resize canvas when window resizes
function resizeCanvases() {
    if (p5sketch) {
        // Resize to full window dimensions
        p5sketch.resizeCanvas(window.innerWidth, window.innerHeight);
        
        // Make sure the canvas has the correct styles
        const canvas = document.querySelector('.background-visualization');
        if (canvas) {
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100vw';
            canvas.style.height = '100vh';
            canvas.style.zIndex = '-1';
        }
    }
}

// Initialize visualizer when audio plays
function initVisualizer() {
    try {
        // Get the Web Audio API context from Howler
        const audioContext = Howler.ctx;
        
        // Create analyzer if it doesn't exist
        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048; // Increased for better resolution
            analyser.smoothingTimeConstant = 0.8;
        }
        
        // Connect the analyzer to Howler's master gain node
        // First disconnect any existing connections to avoid duplicates
        try {
            Howler.masterGain.disconnect(analyser);
        } catch (e) {
            // Ignore disconnection errors
        }
        
        // Connect the master gain to the analyzer
        Howler.masterGain.connect(analyser);
        
        console.log("Audio analyzer initialized successfully");
        
        // Test if we're getting data
        const testData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(testData);
        console.log("Initial frequency data sample:", testData.slice(0, 10));
    } catch (error) {
        console.error("Error initializing audio analyzer:", error);
    }
}

// Format time in MM:SS format
function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds === Infinity) {
        return '0:00';
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

// Update progress bar and time display
function updateProgress() {
    if (!audio) return;
    
    try {
        const seek = audio.seek() || 0;
        const duration = audio.duration() || 1;
        
        // Validate values to prevent NaN or Infinity
        if (isNaN(seek) || isNaN(duration) || duration === 0) {
            return;
        }
        
        const progressPercentage = Math.min((seek / duration) * 100, 100); // Cap at 100%
        
        // Update progress bar width
        progressBar.style.width = `${progressPercentage}%`;
        
        // Make dot visible and active
        progressDot.classList.add('active');
        
        // Update current time display if it exists
        const currentTimeElement = document.getElementById('current-time');
        if (currentTimeElement) {
            currentTimeElement.textContent = formatTime(seek);
        }
    } catch (error) {
        console.error('Error updating progress:', error);
    }
}

// Add seek functionality to progress bar
function initSeek() {
    progressContainer.addEventListener('click', (e) => {
        if (!audio) return;
        
        const clickPosition = e.offsetX / progressContainer.offsetWidth;
        const duration = audio.duration();
        
        audio.seek(duration * clickPosition);
    });
}

function resetProgress() {
    progressBar.style.width = '0%';
    progressDot.classList.remove('active');
}

// Fetch directory contents from GitHub
async function fetchDirectory(path) {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${path}`
        );
        
        if (!response.ok) {
            console.error(`GitHub API error: ${response.status} ${response.statusText}`);
            const errorData = await response.json();
            console.error('Error details:', errorData);
            return [];
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Error fetching directory:', error);
        return [];
    }
}

// Fetch and read comment.txt file
async function getSessionComment(dateDir) {
    try {
        const files = await fetchDirectory(dateDir.path);
        const commentFile = files.find(file => file.name.toLowerCase() === 'comment.txt');
        
        if (commentFile && commentFile.download_url) {
            try {
                const response = await fetch(commentFile.download_url);
                if (response.ok) {
                    return await response.text();
                }
            } catch (fetchError) {
                console.error('Error fetching comment file:', fetchError);
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting session comment:', error);
        return null;
    }
}

// Get all sessions with tracks
async function getSessions() {
    try {
        console.log('Fetching sessions...');
        const sessions = [];
        const dates = await fetchDirectory('audio');
        
        console.log('Found directories:', dates);
        
        // Ensure dates is an array before filtering
        if (!Array.isArray(dates)) {
            console.error('Expected array of directories but got:', dates);
            return [];
        }

        for (const dateDir of dates.filter(d => d && d.type === 'dir')) {
            console.log('Processing directory:', dateDir.name);
            const tracks = await fetchDirectory(dateDir.path);
            console.log('Found tracks:', tracks);
            
            // Ensure tracks is an array
            if (!Array.isArray(tracks)) {
                console.error('Expected array of tracks but got:', tracks);
                continue;
            }
            
            const validTracks = tracks
                .filter(t => t && t.name && (t.name.endsWith('.mp3') || t.name.endsWith('.m4a')))
                .map(track => ({
                    title: track.name.replace('.mp3', '').replace('.m4a', ''),
                    url: `${AUDIO_BASE_URL}/${dateDir.name}/${track.name}`
                }));

            if (validTracks.length > 0) {
                const comment = await getSessionComment(dateDir);
                console.log('Comment for', dateDir.name, ':', comment);
                
                sessions.push({
                    date: dateDir.name,
                    tracks: validTracks,
                    comment: comment
                });
            }
        }

        console.log('Final sessions:', sessions);
        return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
        console.error('Error loading sessions:', error);
        return [];
    }
}

// Load track durations
function loadTrackDurations() {
    document.querySelectorAll('.track-item').forEach(item => {
        const src = item.dataset.src;
        const durationElement = item.querySelector('.track-duration');
        
        // Create temporary Howl to get duration
        const tempHowl = new Howl({
            src: [src],
            html5: true,
            preload: true,
            format: [src.split('.').pop()],
            onload: function() {
                durationElement.textContent = formatTime(this.duration());
            },
            onloaderror: function() {
                durationElement.textContent = '--:--';
            }
        });
    });
}

// Add a loading screen function
function showLoadingScreen() {
    // Create loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading PBT Jam Archive...</div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
    return loadingOverlay;
}

// Function to hide loading screen with fade out
function hideLoadingScreen(loadingOverlay) {
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => {
        if (loadingOverlay.parentNode) {
            loadingOverlay.parentNode.removeChild(loadingOverlay);
        }
    }, 500); // Match this with CSS transition time
}

// Update the window load event handler
window.addEventListener('load', async () => {
    // Show loading screen
    const loadingOverlay = showLoadingScreen();
    
    try {
        // Load sessions first
        await populateSessions(); // Remove the preload mode parameter
        
        // Set up the p5 sketch
        setupP5Background();
        
        // Short delay to ensure everything is rendered
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Now reveal the content
        document.body.classList.add('content-loaded');
    } catch (error) {
        console.error('Initialization error:', error);
        container.innerHTML = '<div class="loading">Error loading content</div>';
    } finally {
        // Hide loading screen
        hideLoadingScreen(loadingOverlay);
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        resizeCanvases();
    });
});

// Update populateSessions to support preloading
async function populateSessions(preloadMode = false) {
    const container = document.getElementById('sessions-list');
    
    if (!preloadMode) {
        container.innerHTML = '<div class="loading">Loading sessions...</div>';
    }

    const sessions = await getSessions();
    
    // Clear the container
    container.innerHTML = '';

    if (sessions.length === 0) {
        container.innerHTML = '<div class="loading">No sessions found</div>';
        return;
    }

    // Create session elements
    sessions.forEach(session => {
        const sessionElement = document.createElement('div');
        sessionElement.className = 'session-card';
        
        // Create HTML with comment section if available
        let sessionHTML = `
            <div class="session-date">${new Date(session.date).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            })}</div>`;
            
        // Add comment if available
        if (session.comment && session.comment.trim()) {
            sessionHTML += `<div class="session-comment">${session.comment}</div>`;
        }
        
        sessionHTML += `
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
        `;
        
        sessionElement.innerHTML = sessionHTML;
        container.appendChild(sessionElement);
    });

    // Load track durations
    loadTrackDurations();

    // Add track click handlers
    document.querySelectorAll('.track-item').forEach(item => {
        // Add click event handlers for tracks
        item.addEventListener('click', () => {
            const src = item.dataset.src;
            const titleElement = item.querySelector('.track-title');
            const originalTitle = titleElement.getAttribute('data-original-title') || titleElement.textContent;
            
            // Remove playing indication from all tracks
            document.querySelectorAll('.track-item').forEach(track => {
                const trackTitle = track.querySelector('.track-title');
                trackTitle.textContent = trackTitle.getAttribute('data-original-title') || trackTitle.textContent;
                trackTitle.removeAttribute('data-original-title');
                track.classList.remove('playing');
            });
            
            // Add playing indication to current track
            item.classList.add('playing');
            titleElement.setAttribute('data-original-title', originalTitle);
            titleElement.textContent = `${originalTitle} (playing now)`;
            
            // Play the track
            if (audio) {
                audio.stop();
                if (animationId) cancelAnimationFrame(animationId);
                clearInterval(progressInterval);
            }
            
            audio = new Howl({
                src: [src],
                html5: false, // Force Web Audio API instead of HTML5 Audio
                format: [src.split('.').pop()],
                volume: volumeControl.value,
                onload: function() {
                    const durationElement = document.getElementById('total-time');
                    if (durationElement) {
                        const duration = this.duration();
                        durationElement.textContent = formatTime(duration);
                    }
                },
                onplay: () => {
                    playPauseBtn.textContent = '⏸';
                    document.getElementById('current-track').textContent = originalTitle;
                    
                    // Initialize visualizer after a short delay to ensure audio is playing
                    setTimeout(() => {
                        initVisualizer();
                        initSeek();
                        
                        if (progressInterval) {
                            clearInterval(progressInterval);
                        }
                        
                        progressInterval = setInterval(updateProgress, 100);
                    }, 100);
                },
                onloaderror: function(id, error) {
                    console.error('Error loading audio:', error);
                    alert('Error loading audio file. Please try another track.');
                },
                onpause: () => {
                    playPauseBtn.textContent = '▶';
                },
                onend: () => {
                    playPauseBtn.textContent = '▶';
                    clearInterval(progressInterval);
                    resetProgress();
                },
                onstop: () => {
                    playPauseBtn.textContent = '▶';
                    clearInterval(progressInterval);
                    resetProgress();
                    
                    // Remove playing indication from all tracks when stopped
                    document.querySelectorAll('.track-item').forEach(track => {
                        const trackTitle = track.querySelector('.track-title');
                        trackTitle.textContent = trackTitle.getAttribute('data-original-title') || trackTitle.textContent;
                        trackTitle.removeAttribute('data-original-title');
                        track.classList.remove('playing');
                    });
                }
            });
            
            audio.play();
        });
    });

    // Add time display
    addTimeDisplay();
}

// Play/pause button handler
playPauseBtn.addEventListener('click', () => {
    if (!audio) return;
    
    if (audio.playing()) {
        audio.pause();
    } else {
        audio.play();
    }
});

// Volume control
volumeControl.addEventListener('input', (e) => {
    if (audio) audio.volume(e.target.value);
});

// Add time display to player
function addTimeDisplay() {
    const trackInfo = document.querySelector('.track-info');
    
    // Check if time display already exists
    if (!document.querySelector('.time-display')) {
        const timeDisplay = document.createElement('div');
        timeDisplay.className = 'time-display';
        timeDisplay.innerHTML = `
            <span id="current-time">0:00</span>
            <span class="time-separator">/</span>
            <span id="total-time">0:00</span>
        `;
        trackInfo.appendChild(timeDisplay);
    }
}

// Create a new p5 instance for the background visualization
function setupP5Background() {
    p5sketch = new p5((p) => {
        let phase = 0;
        let smoothedAmplitude = 0;
        let targetAmplitude = 0;
        let frequencyData = new Uint8Array(1024);
        let dotSize = 2;
        let waveSpeed = 0.5;
        let bassEnergy = 0;
        let midEnergy = 0;
        let trebleEnergy = 0;
        let energyHistory = [];
        let showDebug = false; // Debug toggle
        let debugButton;

        p.setup = () => {
            // Create full-screen canvas
            const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
            
            // Add these styles immediately
            canvas.elt.style.position = 'fixed';
            canvas.elt.style.top = '0';
            canvas.elt.style.left = '0';
            canvas.elt.style.zIndex = '-1';
            canvas.elt.style.pointerEvents = 'none';
            // Position the canvas as a fixed background with important flag
            canvas.style('position', 'fixed !important');
            canvas.style('top', '0');
            canvas.style('left', '0');
            canvas.style('z-index', '-1'); // Behind all content
            canvas.style('opacity', '0.7'); // Slightly faded
            canvas.style('pointer-events', 'none'); // Allow clicking through the canvas
            
            // Add a class to identify our canvas
            canvas.class('background-visualization');
            
            // Force a resize to ensure proper dimensions
            p.windowResized();
            
            // Create debug toggle button
            debugButton = p.createButton('Debug');
            debugButton.position(20, 20);
            debugButton.style('background', 'rgba(0,0,0,0.5)');
            debugButton.style('color', '#fff');
            debugButton.style('border', '1px solid rgba(255,255,255,0.3)');
            debugButton.style('border-radius', '4px');
            debugButton.style('padding', '4px 8px');
            debugButton.style('font-size', '10px');
            debugButton.style('cursor', 'pointer');
            debugButton.style('z-index', '1000'); // Above the canvas
            debugButton.mousePressed(() => {
                showDebug = !showDebug;
                debugButton.html(showDebug ? 'Hide' : 'Debug');
            });
            
            p.colorMode(p.HSB);
            p.noStroke();
        };

        p.draw = () => {
            p.background(0, 0.05); // More transparent for stronger trails
            
            // Process audio data
            if (analyser && audio && audio.playing()) {
                analyser.getByteFrequencyData(frequencyData);
                
                // Check if we're getting any data
                let sum = 0;
                for (let i = 0; i < frequencyData.length; i++) {
                    sum += frequencyData[i];
                }
                const average = sum / frequencyData.length;
                
                // Calculate frequency band energies
                const bassRange = Math.floor(frequencyData.length * 0.1); // 0-200Hz
                const midRange = Math.floor(frequencyData.length * 0.5); // 200-5kHz
                
                // Reset energy values
                bassEnergy = 0;
                midEnergy = 0;
                trebleEnergy = 0;
                
                // Calculate energy in each band
                for (let i = 0; i < frequencyData.length; i++) {
                    const normalizedValue = frequencyData[i] / 255;
                    if (i < bassRange) {
                        bassEnergy += normalizedValue;
                    } else if (i < midRange) {
                        midEnergy += normalizedValue;
                    } else {
                        trebleEnergy += normalizedValue;
                    }
                }
                
                // Normalize and smooth energies
                bassEnergy = bassEnergy / bassRange;
                midEnergy = midEnergy / (midRange - bassRange);
                trebleEnergy = trebleEnergy / (frequencyData.length - midRange);
                
                // Calculate overall amplitude with more dynamic range
                const rawAmplitude = (bassEnergy + midEnergy + trebleEnergy) / 3;
                targetAmplitude = p.constrain(rawAmplitude * 3, 0.5, 4);
                
                // Store energy for visualization
                energyHistory.push({
                    bass: bassEnergy,
                    mid: midEnergy,
                    treble: trebleEnergy
                });
                if (energyHistory.length > 50) energyHistory.shift();
            } else {
                // Gentle animation when no audio is playing
                targetAmplitude = 0.5 + Math.sin(p.frameCount * 0.01) * 0.2;
                
                // Create gentle color cycling
                bassEnergy = 0.3 + Math.sin(p.frameCount * 0.005) * 0.1;
                midEnergy = 0.3 + Math.sin(p.frameCount * 0.007 + 2) * 0.1;
                trebleEnergy = 0.3 + Math.sin(p.frameCount * 0.003 + 4) * 0.1;
                
                // Add to energy history for idle animation
                if (p.frameCount % 5 === 0) {
                    energyHistory.push({
                        bass: bassEnergy,
                        mid: midEnergy,
                        treble: trebleEnergy
                    });
                    if (energyHistory.length > 50) energyHistory.shift();
                }
            }

            // Show debug info if enabled
            if (showDebug) {
                p.fill(255);
                p.textSize(10);
                p.text(`Audio playing: ${audio ? audio.playing() : false}`, 10, 15);
                p.text(`Analyzer: ${!!analyser}`, 10, 30);
                p.text(`Bass: ${bassEnergy.toFixed(3)}`, 10, 45);
                p.text(`Mid: ${midEnergy.toFixed(3)}`, 10, 60);
                p.text(`Treble: ${trebleEnergy.toFixed(3)}`, 10, 75);
                p.text(`Amplitude: ${targetAmplitude.toFixed(3)}`, 10, 90);
            }

            // Smooth amplitude changes
            smoothedAmplitude = p.lerp(smoothedAmplitude, targetAmplitude, 0.1);
            
            // Calculate dynamic parameters
            const wavelength = p.map(midEnergy, 0, 1, 100, 20);
            const waveHeight = smoothedAmplitude * p.height/8; // Reduced height for background
            dotSize = p.map(smoothedAmplitude, 0, 4, 2, 6);
            waveSpeed = p.map(trebleEnergy, 0, 1, 0.1, 0.5); // Slower for background
            
            // Add pulsing glow effect
            const maxDimension = Math.max(p.width, p.height);
            const glowSize = maxDimension * smoothedAmplitude * 0.8;
            p.drawingContext.filter = 'blur(60px)'; // More blur for background
            
            // Multiple layers of glow with different colors
            p.fill(0, 80, 100, 0.05 * bassEnergy * smoothedAmplitude);
            p.ellipse(p.width/2, p.height/2, glowSize * bassEnergy);
            
            p.fill(120, 80, 100, 0.05 * midEnergy * smoothedAmplitude);
            p.ellipse(p.width/2, p.height/2, glowSize * 0.8 * midEnergy);
            
            p.fill(240, 80, 100, 0.05 * trebleEnergy * smoothedAmplitude);
            p.ellipse(p.width/2, p.height/2, glowSize * 0.6 * trebleEnergy);
            
            p.fill(200, 50, 100, 0.08 * smoothedAmplitude);
            p.ellipse(p.width/2, p.height/2, glowSize);
            
            p.drawingContext.filter = 'none';
            
            // Draw multiple sine waves across the screen
            phase += waveSpeed;
            
            // Draw 3 waves at different heights
            for (let wave = 0; wave < 3; wave++) {
                const waveY = p.height * (0.25 + wave * 0.25);
                const waveAmplitude = waveHeight * (1 - wave * 0.2);
                
                for (let x = 0; x < p.width; x += wavelength/3) {
                    const angle = phase + (x * p.TWO_PI) / wavelength + wave;
                    const y = waveY + p.sin(angle) * waveAmplitude;
                    
                    // Color based on frequency content
                    const hue = (p.map(midEnergy, 0, 1, 200, 360) + wave * 30) % 360;
                    const saturation = p.map(trebleEnergy, 0, 1, 60, 100);
                    const brightness = p.map(bassEnergy, 0, 1, 70, 100);
                    p.fill(hue, saturation, brightness, 0.7); // More transparent
                    
                    // Size variation
                    const size = dotSize + bassEnergy * 2 + midEnergy * 1.5;
                    p.ellipse(x, y, size, size);
                }
            }

            // Skip drawing the frequency bars for the background visualization
        };

        p.windowResized = () => {
            p.resizeCanvas(window.innerWidth, window.innerHeight);
            
            // Update debug button position
            if (debugButton) {
                debugButton.position(20, 20);
            }
        };
    });
    
    // Add a MutationObserver to ensure our canvas isn't removed
    const bodyObserver = new MutationObserver((mutations) => {
        const canvas = document.querySelector('.background-visualization');
        if (!canvas || canvas.style.display === 'none' || canvas.style.visibility === 'hidden') {
            console.log('Canvas issues detected, recreating...');
            if (p5sketch) p5sketch.remove();
            setupP5Background();
        }
    });
    
    // Start observing the body for changes
    bodyObserver.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });
}