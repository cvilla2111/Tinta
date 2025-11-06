// Piano Web Audio API Setup
class Piano {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.activeNotes = new Map();
        this.volume = 1.0;
        this.activeTouches = new Map(); // Track multiple touches for multi-touch chords and glissando
        this.presentationRequest = null;
        this.presentationConnection = null;

        // 38 keys starting from C2 to D5
        this.keys = this.generateKeys();

        this.init();
    }

    generateKeys() {
        const keys = [];
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const startOctave = 2;
        const totalKeys = 38;

        for (let i = 0; i < totalKeys; i++) {
            const noteIndex = i % 12;
            const octave = startOctave + Math.floor(i / 12);
            const noteName = notes[noteIndex];
            const isBlack = noteName.includes('#');

            // Calculate frequency (1 octave higher)
            const a4 = 440;
            const a4Index = 57; // A4 is the 58th key on 88-key piano, adjusted for 61 keys starting at C2
            const semitoneOffset = i - (a4Index - 24); // 24 is offset from C2 to A4
            const frequency = a4 * Math.pow(2, semitoneOffset / 12) * 2; // Multiply by 2 for 1 octave higher

            keys.push({
                note: noteName + octave,
                frequency: frequency,
                isBlack: isBlack
            });
        }

        return keys;
    }

    init() {
        this.initAudio();
        this.renderPiano();
        this.setupEventListeners();
    }

    initAudio() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.gain.value = this.volume;
    }

    renderPiano() {
        const pianoElement = document.getElementById('piano');

        // Group keys into octaves with their black keys
        const keySlots = [];

        for (let i = 0; i < this.keys.length; i++) {
            const currentKey = this.keys[i];

            if (!currentKey.isBlack) {
                const slot = {
                    white: currentKey,
                    black: null
                };

                // Check if next key is black and belongs to this white key
                if (i + 1 < this.keys.length && this.keys[i + 1].isBlack) {
                    slot.black = this.keys[i + 1];
                    i++; // Skip the black key in next iteration
                }

                keySlots.push(slot);
            }
        }

        // Render each slot
        keySlots.forEach(slot => {
            const slotWrapper = document.createElement('div');
            slotWrapper.className = 'key-slot';

            // White key
            const whiteKey = document.createElement('div');
            whiteKey.className = 'key white-key';
            whiteKey.dataset.note = slot.white.note;
            whiteKey.dataset.frequency = slot.white.frequency;

            // Add label to white key
            const whiteLabel = document.createElement('span');
            whiteLabel.className = 'key-label';
            whiteLabel.textContent = slot.white.note;
            whiteKey.appendChild(whiteLabel);

            this.addKeyListeners(whiteKey, slot.white.frequency);
            slotWrapper.appendChild(whiteKey);

            // Black key (if exists)
            if (slot.black) {
                const blackKey = document.createElement('div');
                blackKey.className = 'key black-key';
                blackKey.dataset.note = slot.black.note;
                blackKey.dataset.frequency = slot.black.frequency;

                // Add label to black key as fraction format
                const labelData = this.getBlackKeyLabel(slot.black.note);
                if (labelData) {
                    const blackLabel = document.createElement('div');
                    blackLabel.className = 'key-label black-key-label';
                    blackLabel.innerHTML = `
                        <div class="note-sharp">${labelData.sharp}</div>
                        <div class="note-divider"></div>
                        <div class="note-flat">${labelData.flat}</div>
                    `;
                    blackKey.appendChild(blackLabel);
                }

                this.addKeyListeners(blackKey, slot.black.frequency);
                slotWrapper.appendChild(blackKey);
            }

            pianoElement.appendChild(slotWrapper);
        });
    }

    getBlackKeyLabel(note) {
        // Convert sharp notation to separate sharp and flat names
        const sharpToFlat = {
            'C#': { sharp: 'C#', flat: 'Db' },
            'D#': { sharp: 'D#', flat: 'Eb' },
            'F#': { sharp: 'F#', flat: 'Gb' },
            'G#': { sharp: 'G#', flat: 'Ab' },
            'A#': { sharp: 'A#', flat: 'Bb' }
        };

        const noteName = note.replace(/[0-9]/g, ''); // Remove octave number
        return sharpToFlat[noteName] || null;
    }

    addKeyListeners(keyElement, frequency) {
        // Mouse events
        keyElement.addEventListener('mousedown', () => this.playNote(frequency, keyElement));
        keyElement.addEventListener('mouseup', () => this.stopNote(frequency, keyElement));
        keyElement.addEventListener('mouseleave', () => this.stopNote(frequency, keyElement));

        // Touch events handled globally for multi-touch support
    }

    setupEventListeners() {
        // Volume control
        const volumeSlider = document.getElementById('volume');
        const volumeValue = document.getElementById('volume-value');

        volumeSlider.addEventListener('input', (e) => {
            this.volume = e.target.value / 100;
            this.masterGain.gain.value = this.volume;
            volumeValue.textContent = e.target.value + '%';
        });

        // Global touch events for multi-touch support
        const pianoElement = document.getElementById('piano');

        pianoElement.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchStart(e);
        }, { passive: false });

        pianoElement.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleTouchMove(e);
        }, { passive: false });

        pianoElement.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleTouchEnd(e);
        }, { passive: false });

        pianoElement.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.handleTouchEnd(e);
        }, { passive: false });

        // Cast/Presentation button
        this.setupCastButton();
    }

    setupCastButton() {
        const castButton = document.getElementById('cast-button');

        // Check if Presentation API is available
        if ('PresentationRequest' in window) {
            castButton.addEventListener('click', () => this.togglePresentation());
        } else {
            castButton.disabled = true;
            castButton.title = 'Presentation API not supported in this browser';
        }
    }

    async togglePresentation() {
        if (this.presentationConnection) {
            // Terminate existing presentation
            this.presentationConnection.terminate();
            this.presentationConnection = null;
            document.getElementById('cast-button').classList.remove('casting');
        } else {
            // Start new presentation
            try {
                // Create presentation request with current page URL
                const presentationUrl = window.location.href;
                this.presentationRequest = new PresentationRequest([presentationUrl]);

                // Start the presentation
                this.presentationConnection = await this.presentationRequest.start();

                // Update button state
                document.getElementById('cast-button').classList.add('casting');

                // Handle connection state changes
                this.presentationConnection.addEventListener('terminate', () => {
                    this.presentationConnection = null;
                    document.getElementById('cast-button').classList.remove('casting');
                });

                this.presentationConnection.addEventListener('close', () => {
                    this.presentationConnection = null;
                    document.getElementById('cast-button').classList.remove('casting');
                });

            } catch (error) {
                console.error('Failed to start presentation:', error);
                alert('Unable to start presentation. Make sure a second display is available.');
            }
        }
    }

    handleTouchStart(e) {
        // Process all new touches
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);

            if (element && element.classList.contains('key')) {
                const frequency = parseFloat(element.dataset.frequency);
                this.activeTouches.set(touch.identifier, {
                    keyElement: element,
                    frequency: frequency
                });
                this.playNote(frequency, element);
            }
        }
    }

    handleTouchMove(e) {
        // Process all moving touches for glissando
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);

            if (element && element.classList.contains('key')) {
                const frequency = parseFloat(element.dataset.frequency);
                const touchData = this.activeTouches.get(touch.identifier);

                // If moved to a different key
                if (touchData && touchData.keyElement !== element) {
                    // Stop previous note
                    this.stopNote(touchData.frequency, touchData.keyElement);

                    // Play new note
                    this.activeTouches.set(touch.identifier, {
                        keyElement: element,
                        frequency: frequency
                    });
                    this.playNote(frequency, element);
                }
            }
        }
    }

    handleTouchEnd(e) {
        // Process all ended touches
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const touchData = this.activeTouches.get(touch.identifier);

            if (touchData) {
                this.stopNote(touchData.frequency, touchData.keyElement);
                this.activeTouches.delete(touch.identifier);
            }
        }
    }

    playNote(frequency, keyElement) {
        // Don't play if already playing
        if (this.activeNotes.has(frequency)) return;

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const now = this.audioContext.currentTime;

        // Create main gain node for this note
        const noteGain = this.audioContext.createGain();

        // Create filter for warmth
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3000 + (frequency * 2);
        filter.Q.value = 1;

        // Create multiple oscillators for richer sound
        const oscillators = [];
        const gains = [];

        // Fundamental frequency (main tone)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.type = 'triangle';
        osc1.frequency.value = frequency;
        gain1.gain.value = 0.4;
        osc1.connect(gain1);
        gain1.connect(filter);
        oscillators.push(osc1);
        gains.push(gain1);

        // Second harmonic (octave)
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = frequency * 2;
        gain2.gain.value = 0.15;
        osc2.connect(gain2);
        gain2.connect(filter);
        oscillators.push(osc2);
        gains.push(gain2);

        // Third harmonic
        const osc3 = this.audioContext.createOscillator();
        const gain3 = this.audioContext.createGain();
        osc3.type = 'sine';
        osc3.frequency.value = frequency * 3;
        gain3.gain.value = 0.08;
        osc3.connect(gain3);
        gain3.connect(filter);
        oscillators.push(osc3);
        gains.push(gain3);

        // Sub oscillator for depth
        const osc4 = this.audioContext.createOscillator();
        const gain4 = this.audioContext.createGain();
        osc4.type = 'sine';
        osc4.frequency.value = frequency * 0.5;
        gain4.gain.value = 0.1;
        osc4.connect(gain4);
        gain4.connect(filter);
        oscillators.push(osc4);
        gains.push(gain4);

        filter.connect(noteGain);
        noteGain.connect(this.masterGain);

        // Piano-like ADSR envelope
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.8, now + 0.002); // Fast attack
        noteGain.gain.exponentialRampToValueAtTime(0.3, now + 0.1); // Decay
        noteGain.gain.exponentialRampToValueAtTime(0.15, now + 0.5); // Sustain decay

        // Start all oscillators
        oscillators.forEach(osc => osc.start(now));

        this.activeNotes.set(frequency, { oscillators, noteGain, filter });

        if (keyElement) {
            keyElement.classList.add('active');
        }
    }

    stopNote(frequency, keyElement) {
        const note = this.activeNotes.get(frequency);
        if (!note) return;

        const now = this.audioContext.currentTime;
        const releaseTime = 0.3; // Piano-like release

        // Release envelope
        note.noteGain.gain.cancelScheduledValues(now);
        note.noteGain.gain.setValueAtTime(note.noteGain.gain.value, now);
        note.noteGain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);

        // Stop all oscillators
        note.oscillators.forEach(osc => osc.stop(now + releaseTime));

        this.activeNotes.delete(frequency);

        if (keyElement) {
            keyElement.classList.remove('active');
        }
    }
}

// Initialize piano when page loads
window.addEventListener('DOMContentLoaded', () => {
    new Piano();

    // Try to set fixed window size (may not work in all browsers due to security restrictions)
    try {
        window.resizeTo(1400, 400);
    } catch(e) {
        // Silent fail if browser blocks this
    }

    // Prevent system gestures on the piano container
    const pianoContainer = document.querySelector('.piano-container');
    if (pianoContainer) {
        pianoContainer.addEventListener('touchstart', (e) => {
            if (e.touches.length >= 2) {
                e.preventDefault();
            }
        }, { passive: false });

        pianoContainer.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        pianoContainer.addEventListener('gesturestart', (e) => {
            e.preventDefault();
        }, { passive: false });

        pianoContainer.addEventListener('gesturechange', (e) => {
            e.preventDefault();
        }, { passive: false });
    }
});
