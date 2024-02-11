document.addEventListener('DOMContentLoaded', (event) => {
    const canvas = document.getElementById('breakoutCanvas');
    const body = document.getElementById('body');
    const ctx = canvas.getContext('2d');
    const startGameButton = document.getElementById('startGameButton');
    const audioContext = new AudioContext();

    // Load your sound and store it for later use
    let brickHitSoundBuffer;
    loadSound('break.mp3').then(buffer => {
        brickHitSoundBuffer = buffer;
    });
    loadSound('bump.mp3').then(buffer => {
        paddleHitSoundBuffer = buffer;
    });
    loadSound('22H.wav').then(buffer => {
        bonusSoundBuffer = buffer;
    });

    // Declare gainNode and filter globally
    let gainNode = audioContext.createGain();
    let filter = audioContext.createBiquadFilter();

    let animationIntensity = 0;

    let ballRadius;
    let x, y;
    let dx = 5;
    let dy = -5;

    let originalDx = 5; // Original horizontal speed
    let originalDy = -5; // Original vertical speed

    let adjustedDx = 5; // Original horizontal speed
    let adjustedDy = -5; // Original vertical speed

    let paddleHeight = 10;
    let paddleWidth;
    let paddleX;
    let lastPaddleX = paddleX;

    let bricksCleared = 0;

    let halfBricksClearedTriggered = false;
    let ninetyPercentBricksClearedTriggered = false;

    let globalScale = 1;
    let animationOffset = 0;  // Dynamic offset for animation

    let paddleY;

    let consecutiveBrickHits = 0;
    const consecutiveHitsThreshold = 20; // Threshold for triggering the portrait animation

    let brickRowCount = 16;
    let brickColumnCount = 6;
    let brickWidth;
    let brickHeight = 15;
    let brickPadding = 7;
    let brickOffsetTop = 80;
    let brickOffsetLeft;

    let inGameOverSequence = false;
    let lossCount = 0; // Number of times the player has lost

    let ballVisible = true;

    let lastFrameTimeMs = 0;
    let hitstopDuration = 64;
    let hitstopEndTime = 0;

    let paddleBounceHeight = 300; // Amount the paddle "bounces" up
    let isPaddleBouncing = false;
    
    // Adjust these values based on desired bounce speed and height
    const bounceHeight = 300; // Total pixels to move up
    const framesForBounceUp = 20; // Total frames to complete the bounce up
    const framesForBounceDown = 60; // Total frames to complete the bounce down
    let paddleBounceSpeed = 1.5; // Factor by which the ball's speed increases

    let animationFrameId;

    let totalBricks;
    let initialBlur = 5;

    let bricks = [];

    let particles = [];
    
    let gameStarted = false; // Flag to control game start

    // Hide the canvas initially to display only the welcome screen
    canvas.style.display = 'none';

    startGameButton.addEventListener('click', function() {
        document.getElementById('welcomeScreen').style.display = 'none';
        canvas.style.display = 'block';
        gameStarted = true;
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const audioElement = document.getElementById('music');
        audioElement.loop = true; // Ensure the track loops
        const track = audioContext.createMediaElementSource(audioElement);

        // Re-configure filter and gainNode inside the click event if needed
        filter.type = 'highpass';
        filter.frequency.value = 1000; // Starting frequency

        gainNode.gain.value = 0.5; // Start at 50% volume

        // Setup audio graph
        track.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        audioElement.play();
        initGame();
    });

    function initGame() {

        // Correctly size the canvas before starting the game
        resizeCanvas();
        // Reset game state and variables
        setupGame();

        // Start the game loop
        if (gameStarted && !animationFrameId) { // Check if game started and no loop is running
            animationFrameId = requestAnimationFrame(draw);
        }
    }
    

    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.size = Math.random() * 3 + 1;
            this.speedX = Math.random() * 6 - 3;
            this.speedY = Math.random() * 6 - 3;
            this.color = color;
            this.lifespan = 100;
        }
    
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.lifespan -= 1;
        }
    
        draw(ctx) {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.size, this.size); // Drawing a square
        }
    
        isDead() {
            return this.lifespan <= 0;
        }
    }
    
    function initBricks() {
        for (let c = 0; c < brickColumnCount; c++) {
            bricks[c] = [];
            for (let r = 0; r < brickRowCount; r++) {
                bricks[c][r] = { x: 0, y: 0, status: 1 };
            }
        }
    }

    function loadSound(url) {
        return fetch(url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));
    }
    
    function setupGame() {

        totalBricks = brickRowCount * brickColumnCount;
        updateBlurEffect(totalBricks);

        ballRadius = canvas.width / 64;
        ballVisible = true;

        halfBricksClearedTriggered = false;
        ninetyPercentBricksClearedTriggered = false;

        const speedLoss = 0.25; // Adjust growth rate as needed

        dx = Math.max(2.5, originalDx - (speedLoss * lossCount));
        dy = Math.min(-2.5, originalDy + (speedLoss * lossCount));

        adjustedDx = dx;
        adjustedDy = dy;

        // console.log(dx);

        const basePaddleWidth = canvas.width / 8; // Adjust base size as needed
        const paddleGrowth = canvas.width / 50; // Adjust growth rate as needed
        paddleWidth = basePaddleWidth + (paddleGrowth * lossCount);
    
        // Ensure paddle doesn't grow indefinitely (optional)
        const maxPaddleWidth = canvas.width / 4; // Adjust max size as needed
        paddleWidth = Math.min(paddleWidth, maxPaddleWidth);

        // console.log(paddleWidth);
    
        paddleX = (canvas.width - paddleWidth) / 2;

        paddleY = canvas.height - paddleHeight; // Initial paddle position at the bottom
        
        x = canvas.width / 4;
        y = canvas.height - 50;

        inGameOverSequence = false;
        
        initBricks();

        
        // Hide the invitation message if it's being displayed
        const invitationMessage = document.getElementById('invitationMessage');
        if (invitationMessage) {
            invitationMessage.style.display = 'none';
        }
        
        // Start the game loop
        requestAnimationFrame(draw);
    }

    function explodeBall(ballX, ballY) {
        for (let i = 0; i < 30; i++) { // Generate more particles for a bigger explosion
            particles.push(new Particle(ballX, ballY, "#ff256c")); // Use ball color or any you prefer
        }
    }

    function triggerHitstop() {
        hitstopEndTime = performance.now() + hitstopDuration; // Set when the hitstop should end
    }
    
    function resizeCanvas() {
        const aspectRatio = 2 / 3;
        let newWidth = window.innerWidth;
        let newHeight = window.innerHeight;
        const windowRatio = newWidth / newHeight;
        
        if (windowRatio > aspectRatio) {
            newWidth = newHeight * aspectRatio;
        } else {
            newHeight = newWidth / aspectRatio;
        }
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        brickWidth = newWidth / (brickColumnCount + 2);
        brickOffsetLeft = (canvas.width - brickWidth * brickColumnCount - brickPadding * (brickColumnCount - 1)) / 2;
    }

    function gameOverAnimation() {
        inGameOverSequence = true;
        lossCount++; 

        if (lossCount == 10) {
            animatePortrait('portrait4');
        }

        const canvas = document.getElementById('breakoutCanvas');
        const webglCanvas = document.querySelector('canvas.webgl');
    
        // Start the game over effects immediately
        canvas.style.filter = 'blur(100px)';
        webglCanvas.style.filter = 'blur(50px)';
        canvas.style.transform = 'scale(1.2)';
        webglCanvas.style.opacity = '0';
    
        // Since CSS transitions are set to 1s, the total effect time is expected to be immediate, but the reset timing needs adjustment
        // Allow for the CSS transitions to complete
        setTimeout(() => {
            // Begin reversing the game over effects
            canvas.style.filter = 'blur(0px)';
            webglCanvas.style.filter = 'blur(5px) contrast(100%)';
            canvas.style.transform = 'scale(1)';
            webglCanvas.style.opacity = '1';
    
            // This second timeout ensures we give enough time for the reverse transitions to complete before resetting game state
            setTimeout(() => {
                // Reset the game state here to ensure it happens after all visual transitions are complete
                const initialHighPassFrequency = 750; // Adjust this value as needed
                filter.frequency.value = initialHighPassFrequency;
    
                const audioElement = document.getElementById('music');
                audioElement.currentTime = 0; // Reset audio to the start
                audioElement.play(); // Play the audio again
    
                // Reset scales and other game state variables
                globalScale = 1;
                animationOffset = 0;
                bricksCleared = 0;
                setupGame(); // Resets ballVisible among other things
    
                inGameOverSequence = false;
                
            }, 1000); // Wait another 1s for the reverse transitions to complete
    
        }, 1000); // Initially wait 1s for the first set of transitions to complete
    }

    function updateBlurEffect(remainingBricks) {
        // console.log("remaining bricks:"+remainingBricks);
        // console.log("total bricks:"+totalBricks);
        const blurValue = (remainingBricks / totalBricks) * initialBlur;
        const webglCanvas = document.querySelector('canvas.webgl');
        if (webglCanvas) {
            webglCanvas.style.filter = `blur(${blurValue}px) contrast(${150 - (blurValue * 10)}%)`;
        }
    }

    function playBrickHitSound() {
        if (!brickHitSoundBuffer) {
            console.log("Sound not loaded yet");
            return;
        }
    
        // Create a buffer source
        const source = audioContext.createBufferSource();
        source.buffer = brickHitSoundBuffer;
    
        // Create a gain node to control volume
        const gainNode = audioContext.createGain();
        const volume = 0.8;
        gainNode.gain.value = volume;
    
        // Randomize playback rate for pitch variation
        const playbackRate = Math.random() * 0.5 + 0.8; // Random between 0.8 and 1.2
        source.playbackRate.value = playbackRate;
    
        // Connect the source to the gain node and then to the destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
    
        // Play the sound
        source.start(0);
    }
    function playPaddleHitSound() {
        // Create a buffer source
        const source = audioContext.createBufferSource();
        source.buffer = paddleHitSoundBuffer;
    
        // Create a gain node to control volume
        const gainNode = audioContext.createGain();
        const volume = 0.5;
        gainNode.gain.value = volume;
    
        // Randomize playback rate for pitch variation
        const playbackRate = Math.random() * 0.5 + 0.8; // Random between 0.8 and 1.2
        source.playbackRate.value = playbackRate;
    
        // Connect the source to the gain node and then to the destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
    
        // Play the sound
        source.start(0);
    }

    function playBonusSound() {
        // Create a buffer source
        const source = audioContext.createBufferSource();
        source.buffer = bonusSoundBuffer;
    
        // Create a gain node to control volume
        const gainNode = audioContext.createGain();
        const volume = 0.75;
        gainNode.gain.value = volume;
    
        // Connect the source to the gain node and then to the destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
    
        // Play the sound
        source.start(0);
    }

    
    function explodeBrick(x, y) {
        for (let i = 0; i < 20; i++) { // Generate 20 particles
            particles.push(new Particle(x, y, "#ff256c")); // Use brick color or any you prefer
        }
    }

    function updateParticles() {
        // Update all particles
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            if (particles[i].isDead()) {
                particles.splice(i, 1);
            }
        }
    }
    
    function drawParticles(ctx) {
        particles.forEach(particle => particle.draw(ctx));
    }

    function animatePortrait(portrait) {
        const selectedPortrait = document.getElementById(portrait);
    
        selectedPortrait.classList.add('animated');

        playBonusSound();
    
        setTimeout(() => {
            selectedPortrait.classList.remove('animated');
        }, 4000); // Remove the class after 4 seconds
    }

    function collisionDetection() {
        let remainingBricks = 0;
        for (let c = 0; c < brickColumnCount; c++) {
            for (let r = 0; r < brickRowCount; r++) {
                let b = bricks[c][r];
                if (b.status == 1) {
                    // Calculate brick's actual position and size without scaling
                    let brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
                    let brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
                    let brickRight = brickX + brickWidth;
                    let brickBottom = brickY + brickHeight;
    
                    // Check for collision with the ball
                    if (x > brickX && x < brickRight && y > brickY && y < brickBottom) {
                        consecutiveBrickHits++;
                        if (consecutiveBrickHits >= consecutiveHitsThreshold) {
                            // Array of portraits to choose from
                            const portraits = ['portrait1', 'portrait5', 'portrait6'];
                            // Randomly select a portrait
                            const selectedPortrait = portraits[Math.floor(Math.random() * portraits.length)];
                            console.log("Selected portrait: ", selectedPortrait);
                            animatePortrait(selectedPortrait);
                            consecutiveBrickHits = 0; // Reset the counter
                        }
                        dy = -dy; // Reverse the ball's vertical direction
                        b.status = 0; // Mark the brick as hit
                        playBrickHitSound();
                        
                        explodeBrick(brickX + brickWidth / 2, brickY + brickHeight / 2);
                        triggerHitstop();
                        
                        checkWinCondition(); // Check if this hit wins the game
                        
                        // Update the count of cleared bricks and possibly adjust game elements accordingly
                        bricksCleared++;
                        updateBlurEffect(totalBricks - bricksCleared);
                        updateFilterFrequency(bricksCleared, totalBricks);
                        updateGlobalScale(bricksCleared, totalBricks);
                        const volume = 0.5 + (bricksCleared / totalBricks) * 0.5; // Scale from 0.5 to 1.0
                        gainNode.gain.value = Math.min(volume, 1); // Ensure the volume does not exceed 100%
                        
                    } else {
                        remainingBricks++;
                    }
                }
            }
        }
    
        const clearedPercentage = ((totalBricks - remainingBricks) / totalBricks) * 100;

        // Check if 50% of the bricks are cleared and the animation hasn't been triggered yet
        // console.log(clearedPercentage)
        if (!halfBricksClearedTriggered && clearedPercentage >= 50) {
            animatePortrait('portrait2');
            halfBricksClearedTriggered = true; // Ensure the animation is only triggered once
        }

        // Check if 90% of the bricks are cleared and the animation hasn't been triggered yet
        if (!ninetyPercentBricksClearedTriggered && clearedPercentage >= 90) {
            animatePortrait('portrait3');
            ninetyPercentBricksClearedTriggered = true; // Ensure the animation is only triggered once
        }
    }

    
    function checkWinCondition() {
        let allBricksCleared = true;
        for (let c = 0; c < brickColumnCount; c++) {
            for (let r = 0; r < brickRowCount; r++) {
                if (bricks[c][r].status == 1) {
                    allBricksCleared = false; // Found a brick that hasn't been cleared
                    break; // Exit the loop early as we found a brick still intact
                }
            }
            if (!allBricksCleared) break; // Exit the outer loop early too
        }
    
        if (allBricksCleared) {
            document.getElementById('invitationMessage').style.display = "flex"; // Display win message
            canvas.style.display = "none";
            gameStarted = false; // Stop the game loop from continuing
            cancelAnimationFrame(animationFrameId); // Cancel the scheduled animation frame
            // Optionally, add more end game logic here, like showing a restart button
        }
    }

    function checkPaddleCollision() {
        let effectivePaddleY = isPaddleBouncing ? paddleY - paddleBounceHeight : paddleY;
        if (x > paddleX && x < paddleX + paddleWidth && y + ballRadius >= effectivePaddleY && y < effectivePaddleY + paddleHeight) {
            playPaddleHitSound();
            consecutiveBrickHits = 0;
            // Increase ball speed significantly if paddle is bouncing
            if (isPaddleBouncing) {
                dy = -Math.abs(adjustedDy) * paddleBounceSpeed; // Apply speed increase and ensure the ball goes upward
                isPaddleBouncing = false; // Reset the paddle bounce state immediately after impact
            } else {
                dy = -Math.abs(adjustedDy); // Normal bounce
            }
    
            // Adjust horizontal velocity based on where the ball hits the paddle
            let hitPoint = (x - (paddleX + paddleWidth / 2)) / (paddleWidth / 2);
            dx = hitPoint * adjustedDx;
        }
        // Handle collisions with the sides of the paddle
        else if (y > effectivePaddleY - ballRadius && y < effectivePaddleY + paddleHeight) {
            playPaddleHitSound();
            if ((x + ballRadius > paddleX && x < paddleX) || (x - ballRadius < paddleX + paddleWidth && x > paddleX + paddleWidth)) {
                dx = -dx; // Reverse horizontal direction
                // No vertical speed adjustment here as it's a side hit, unless you want to add a minor effect
            }
        }
        // console.log(`dx: ${dx}, dy: ${dy}`); // For debugging purposes
    }
    
    function drawBricks() {
        const time = Date.now() * 0.005; // Use this if you want each brick to oscillate independently but in sync
    
        for (let c = 0; c < brickColumnCount; c++) {
            for (let r = 0; r < brickRowCount; r++) {
                if (bricks[c][r].status == 1) {
                    // Apply individual animation offset for each brick
                    let individualOffset = Math.sin(time + c + r) * animationIntensity * 0.05; // Max oscillation range 5%
                    let effectiveScale = 1 + individualOffset; // Apply the calculated scale
                    
                    let brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
                    let brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
                    
                    let scaledBrickWidth = brickWidth * effectiveScale;
                    let scaledBrickHeight = brickHeight * effectiveScale;
                    let offsetX = (brickWidth - scaledBrickWidth) / 2; // Center the brick during scale
                    let offsetY = (brickHeight - scaledBrickHeight) / 2; // Center the brick during scale
    
                    ctx.beginPath();
                    ctx.rect((brickX + offsetX) * effectiveScale, (brickY + offsetY) * effectiveScale, scaledBrickWidth, scaledBrickHeight);
                    ctx.fillStyle = "#ff256c";
                    ctx.fill();
                    ctx.closePath();
                }
            }
        }
    }

    function drawPaddle() {
        ctx.beginPath();
        ctx.rect(paddleX, paddleY, paddleWidth, paddleHeight);
        ctx.fillStyle = "#0095DD";
        ctx.fill();
        ctx.closePath();
    }

    function drawBall() {
        if (ballVisible) {
            ctx.beginPath();
            ctx.arc(x, y, ballRadius * globalScale, 0, Math.PI * 2);
            ctx.fillStyle = "#fafcc2";
            ctx.fill();
            ctx.closePath();
        }
    }

    function drawBricks() {
        const effectiveScale = globalScale + animationOffset;
        for (let c = 0; c < brickColumnCount; c++) {
            for (let r = 0; r < brickRowCount; r++) {
                if (bricks[c][r].status == 1) {
                    let brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
                    let brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
                    let scaledBrickWidth = brickWidth * effectiveScale;
                    let scaledBrickHeight = brickHeight * effectiveScale;
                    // Adjust position to keep bricks centered as they scale
                    let offsetX = (brickWidth - scaledBrickWidth) / 2;
                    let offsetY = (brickHeight - scaledBrickHeight) / 2;
                    ctx.beginPath();
                    ctx.rect(brickX + offsetX, brickY + offsetY, scaledBrickWidth, scaledBrickHeight);
                    ctx.fillStyle = "#ff256c";
                    ctx.fill();
                    ctx.closePath();
                }
            }
        }
    }

    function updateGlobalScale(bricksCleared, totalBricks) {
        // Start with no scaling effect and increase as bricks are cleared
        globalScale = 1 + (bricksCleared / totalBricks) * 0.1; // This scales up to 10% extra
    }

    function updateAnimation() {
        let now = Date.now();
        let period = 350; // 350 ms for the pulsation period
        let omega = (2 * Math.PI) / period;
    
        // Calculate the proportion of bricks cleared to total bricks
        let proportionCleared = bricksCleared / totalBricks;
    
        // Base scale starts from 1 (no additional scaling) and increases slightly as bricks are cleared
        let baseScale = 1 + proportionCleared * 0.1; // This ensures the scale starts at 1 and increases
    
        // Now, make the amplitude of the sine wave start at 0 and increase as more bricks are cleared
        // The maximum amplitude of the oscillation could be, for example, 5% of the baseScale
        // This means the oscillation will be more pronounced as more bricks are cleared
        let maxAmplitude = 0.05 * baseScale; // Adjust this value to control the maximum amplitude
        animationOffset = Math.sin(now * omega) * proportionCleared * maxAmplitude;
    }
    
    function draw(timestamp) {
        if (!gameStarted) return; // Exit if the game hasn't started
    
        let now = Date.now();
        let deltaTime = (now - (lastFrameTimeMs || now)) / 1000;
        lastFrameTimeMs = now;
    
        updateAnimation(deltaTime);
    
        // Ensure paddle stays within canvas bounds
        paddleY = Math.min(Math.max(paddleY, canvas.height - paddleHeight), canvas.height - paddleHeight);
    
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas for the next frame
    
        drawBricks();
        if (ballVisible) {
            drawBall();
        }
    
        if (isPaddleBouncing) {
            // Assume handlePaddleBouncing() is your method for handling paddle bounce animation
            handlePaddleBouncing();
        }
    
        drawPaddle();
        collisionDetection(); // Check collisions with bricks
        checkPaddleCollision(); // Check for collisions with the paddle
        updateParticles(deltaTime); // Update and draw particles
        drawParticles(ctx);
    
        // Ball movement with walls collision and game over check
        if (x + dx < ballRadius || x + dx > canvas.width - ballRadius) {
            dx = -dx;
        }
        if (y + dy < ballRadius) {
            dy = -dy;
        } else if (y + dy > canvas.height - ballRadius) {
            // Check if the ball is below the paddle, not just at the canvas bottom
            if (y > paddleY + paddleHeight && !inGameOverSequence) {
                // Handle game over logic here
                gameOverAnimation();
                return; // Exit the function to avoid further updates
            }
        }
    
        x += dx * deltaTime * 60; // Adjust the 60 to control speed
        y += dy * deltaTime * 60; // Adjust the 60 to control speed
    
        lastPaddleX = paddleX; // Update lastPaddleX for the next frame
        animationFrameId = requestAnimationFrame(draw); // Continue the game loop
    }

    function updateFilterFrequency(bricksCleared, totalBricks) {
        const maxFrequency = 750; // Starting frequency
        const minFrequency = 1; // Minimum frequency to not completely lose the audio
        const volume = 0.5 + (bricksCleared / totalBricks) * 0.5; // Scale from 0.5 to 1.0

        // Decrease frequency as more bricks are cleared
        const frequency = maxFrequency - ((bricksCleared / totalBricks) * (maxFrequency - minFrequency));
        if(filter) { // Check if filter is defined before attempting to access its properties
            filter.frequency.value = Math.max(frequency, minFrequency); // Ensure it doesn't go below minFrequency
        }
        if(gainNode) { // Check if filter is defined before attempting to access its properties
            gainNode.gain.value = Math.min(volume, 1); // Ensure the volume does not exceed 100%
        }
    }
    
    window.addEventListener('resize', resizeCanvas, false);
    body.addEventListener("touchmove", function(e) {
        const touchX = e.touches[0].clientX - canvas.getBoundingClientRect().left;
        if (touchX > 0 && touchX < canvas.width) {
            paddleX = touchX - paddleWidth / 2;
        }
    }, false);
    
    resizeCanvas(); // Initialize the game on page load
});