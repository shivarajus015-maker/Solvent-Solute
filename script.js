// --- 1. SCENE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe0f7fa); // Matches CSS background

// Camera Setup
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 6, 12);

// Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2; // Prevent camera going under the table
controls.target.set(0, 2, 0);

// --- 2. LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

// --- 3. 3D OBJECTS ---

// The Lab Table
const tableGeo = new THREE.BoxGeometry(15, 0.5, 15);
const tableMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
const table = new THREE.Mesh(tableGeo, tableMat);
table.position.y = -0.25;
table.receiveShadow = true;
scene.add(table);

// Heating/Cooling Plate
const plateGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.2, 32);
const plateMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
const plate = new THREE.Mesh(plateGeo, plateMat);
plate.position.y = 0.1;
plate.receiveShadow = true;
scene.add(plate);

// The Beaker (Glass)
const beakerGeo = new THREE.CylinderGeometry(1.5, 1.5, 5, 32, 1, true); // openEnded
const beakerMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.9, // Glass-like transparency
    thickness: 0.5,
    side: THREE.DoubleSide
});
const beaker = new THREE.Mesh(beakerGeo, beakerMat);
beaker.position.y = 2.7;
scene.add(beaker);

// Beaker Base
const baseGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.1, 32);
const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
const base = new THREE.Mesh(baseGeo, baseMat);
base.position.y = 0.2;
base.castShadow = true;
scene.add(base);

// The Water (Solvent)
const waterGeo = new THREE.CylinderGeometry(1.45, 1.45, 1, 32);
const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x81d4fa, // Light blue water
    transparent: true,
    opacity: 0.6,
    roughness: 0.1,
    transmission: 0.5
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = 0.25; // Starts at bottom
water.scale.y = 0.01; // Starts empty
scene.add(water);

// The Spoon
const spoonGroup = new THREE.Group();
const handleGeo = new THREE.CylinderGeometry(0.05, 0.05, 6, 8);
const handleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });
const handle = new THREE.Mesh(handleGeo, handleMat);
handle.position.y = 3;
const bowlGeo = new THREE.SphereGeometry(0.25, 16, 16);
const bowl = new THREE.Mesh(bowlGeo, handleMat);
bowl.position.y = 0;
bowl.scale.set(1, 0.5, 1);
spoonGroup.add(handle);
spoonGroup.add(bowl);
spoonGroup.position.set(2, 0, 0); // Start resting on table
spoonGroup.rotation.z = Math.PI / 2;
scene.add(spoonGroup);

// --- 4. SIMULATION VARIABLES ---
let currentWaterLevel = 0; // 0 to 1
let currentSoluteType = 'salt';
let soluteCount = 0;
let maxSaturation = 5; // Base limit for cold water
let isHot = false;
let isStirring = false;
let stirAngle = 0;

const soluteColors = {
    salt: 0xffffff,
    sugar: 0xffcc00,
    crystal: 0x0055ff
};

// Particle systems
let dissolvingParticles = [];
let settledParticles = [];

// --- 5. UI EVENT LISTENERS ---

// Water Slider
const slider = document.getElementById('water-slider');
slider.addEventListener('input', (e) => {
    currentWaterLevel = e.target.value / 100;
    updateWaterVisuals();
});

// Solute Selector
const soluteBtns = document.querySelectorAll('.solute-btn');
soluteBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        soluteBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSoluteType = btn.getAttribute('data-type');
    });
});

// Add Solute Button
document.getElementById('add-solute-btn').addEventListener('click', () => {
    if (currentWaterLevel <= 0.05) {
        alert("Add water first!");
        return;
    }
    addSolute();
});

// Stir Button
document.getElementById('stir-btn').addEventListener('click', () => {
    if (isStirring) return;
    isStirring = true;
    spoonGroup.position.set(0, 3, 0);
    spoonGroup.rotation.z = 0;
    spoonGroup.rotation.x = Math.PI / 6;
    
    // Stirring increases dissolution rate visually
    setTimeout(() => {
        isStirring = false;
        // Reset spoon
        spoonGroup.position.set(2, 0, 0);
        spoonGroup.rotation.z = Math.PI / 2;
        spoonGroup.rotation.x = 0;
    }, 2000);
});

// Temperature Toggle
const tempBtn = document.getElementById('temp-toggle');
tempBtn.addEventListener('click', () => {
    isHot = !isHot;
    if (isHot) {
        tempBtn.classList.add('hot');
        tempBtn.innerText = "Hot Water (80°C)";
        document.getElementById('temp-text').innerText = "80°C";
        maxSaturation = 10; // Hot water dissolves more
        waterMat.color.setHex(0x4fc3f7); // slightly warmer blue
    } else {
        tempBtn.classList.remove('hot');
        tempBtn.innerText = "Cold Water (20°C)";
        document.getElementById('temp-text').innerText = "20°C";
        maxSaturation = 5;
        waterMat.color.setHex(0x81d4fa);
    }
});

// Reset Button
document.getElementById('reset-btn').addEventListener('click', resetSimulation);

// --- 6. SIMULATION LOGIC ---

function updateWaterVisuals() {
    // Water height logic
    const maxHeight = 4.5;
    const targetHeight = currentWaterLevel * maxHeight;
    water.scale.y = Math.max(targetHeight, 0.01);
    water.position.y = 0.25 + (targetHeight / 2);
    
    document.getElementById('status-text').innerText = currentWaterLevel > 0 ? "Unsaturated" : "Empty";
}

function addSolute() {
    soluteCount++;
    document.getElementById('solute-count').innerText = soluteCount;
    
    const capacity = maxSaturation * currentWaterLevel;
    
    if (soluteCount > capacity) {
        // Water is SATURATED. Add to settled particles.
        document.getElementById('status-text').innerText = "SATURATED";
        document.getElementById('status-text').style.color = "#d32f2f";
        spawnSettledParticles();
    } else {
        // Water is UNSATURATED. Add to dissolving particles.
        document.getElementById('status-text').innerText = "Unsaturated";
        document.getElementById('status-text').style.color = "#4caf50";
        spawnDissolvingParticles();
        
        // Tint water slightly based on solute
        if (currentSoluteType === 'salt') waterMat.color.lerp(new THREE.Color(0xffffff), 0.05);
        if (currentSoluteType === 'sugar') waterMat.color.lerp(new THREE.Color(0xfff59d), 0.05);
        if (currentSoluteType === 'crystal') waterMat.color.lerp(new THREE.Color(0x64b5f6), 0.05);
    }
}

// Particle logic for dissolving
function spawnDissolvingParticles() {
    const color = soluteColors[currentSoluteType];
    const particleGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({ color: color });
    
    for (let i = 0; i < 15; i++) {
        const particle = new THREE.Mesh(particleGeo, particleMat);
        
        // Random position inside water
        const radius = Math.random() * 1.3;
        const angle = Math.random() * Math.PI * 2;
        const height = water.position.y + (Math.random() - 0.5) * water.scale.y;
        
        particle.position.set(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
        
        particle.userData = {
            life: 1.0,
            speed: isStirring ? 0.02 : 0.005,
            vx: (Math.random() - 0.5) * 0.05,
            vy: (Math.random() - 0.5) * 0.05,
            vz: (Math.random() - 0.5) * 0.05
        };
        
        scene.add(particle);
        dissolvingParticles.push(particle);
    }
}

// Particle logic for settling at bottom (Saturation)
function spawnSettledParticles() {
    const color = soluteColors[currentSoluteType];
    const particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const particleMat = new THREE.MeshStandardMaterial({ color: color });
    
    for (let i = 0; i < 10; i++) {
        const particle = new THREE.Mesh(particleGeo, particleMat);
        
        // Stack at the bottom
        const radius = Math.random() * 1.2;
        const angle = Math.random() * Math.PI * 2;
        
        particle.position.set(
            Math.cos(angle) * radius,
            0.25 + Math.random() * 0.2, // Just above base
            Math.sin(angle) * radius
        );
        particle.rotation.set(Math.random(), Math.random(), Math.random());
        
        scene.add(particle);
        settledParticles.push(particle);
    }
}

// Reset function
function resetSimulation() {
    currentWaterLevel = 0;
    soluteCount = 0;
    isHot = false;
    isStirring = false;
    maxSaturation = 5;
    
    // Reset UI
    slider.value = 0;
    document.getElementById('solute-count').innerText = "0";
    document.getElementById('status-text').innerText = "Empty";
    document.getElementById('status-text').style.color = "#fff";
    document.getElementById('temp-text').innerText = "20°C";
    tempBtn.classList.remove('hot');
    tempBtn.innerText = "Cold Water (20°C)";
    
    // Reset Water
    water.scale.y = 0.01;
    water.position.y = 0.25;
    waterMat.color.setHex(0x81d4fa);
    
    // Remove all particles
    dissolvingParticles.forEach(p => scene.remove(p));
    settledParticles.forEach(p => scene.remove(p));
    dissolvingParticles = [];
    settledParticles = [];
}

// --- 7. ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Handle Spoon Stirring Animation
    if (isStirring) {
        stirAngle += 0.1;
        spoonGroup.position.x = Math.cos(stirAngle) * 1.0;
        spoonGroup.position.z = Math.sin(stirAngle) * 1.0;
        spoonGroup.position.y = water.position.y; // Move spoon up and down with water
    }
    
    // Animate Dissolving Particles
    for (let i = dissolvingParticles.length - 1; i >= 0; i--) {
        let p = dissolvingParticles[i];
        p.userData.life -= p.userData.speed;
        
        // Move particle (faster if stirring)
        p.position.x += p.userData.vx * (isStirring ? 3 : 1);
        p.position.y += p.userData.vy * (isStirring ? 3 : 1);
        p.position.z += p.userData.vz * (isStirring ? 3 : 1);
        
        // Keep particle inside water cylinder
        if (Math.abs(p.position.x) > 1.4) p.userData.vx *= -1;
        if (Math.abs(p.position.z) > 1.4) p.userData.vz *= -1;
        if (p.position.y > water.position.y + water.scale.y/2 || p.position.y < 0.25) p.userData.vy *= -1;

        // Fade out
        p.material.opacity = p.userData.life;
        p.material.transparent = true;
        
        if (p.userData.life <= 0) {
            scene.remove(p);
            dissolvingParticles.splice(i, 1);
        }
    }
    
    // Animate Settled Particles (slight jiggle)
    settledParticles.forEach(p => {
        p.rotation.x += 0.01;
        p.rotation.y += 0.01;
    });

    renderer.render(scene, camera);
}

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the simulation
animate();