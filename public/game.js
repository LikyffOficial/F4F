import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Configuração Inicial ---
const socket = io();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505); // Escuridão quase total
scene.fog = new THREE.FogExp2(0x000000, 0.03); // Neblina de terror

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

// --- Assets Managers ---
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const otherPlayers = {}; // Armazena meshes dos outros jogadores
const collisionObstacles = []; // Array para colisão (paredes, animatronics)

// --- Mapa Procedural (Pizzaria) ---
function createMap() {
    // Texturas
    const texWall = textureLoader.load('assets/textures/wall.png');
    const texSecFloor = textureLoader.load('assets/textures/securityfloor.png');
    const texGround = textureLoader.load('assets/textures/ground.png');
    const texSecDoor = textureLoader.load('assets/textures/securitydoor.png');
    
    // Repetição de textura
    [texWall, texSecFloor, texGround, texSecDoor].forEach(t => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
    });

    // 1. Sala de Segurança (Pequena, 0,0,0)
    const secFloorGeo = new THREE.PlaneGeometry(10, 10);
    const secFloorMat = new THREE.MeshStandardMaterial({ map: texSecFloor, roughness: 0.8 });
    const secFloor = new THREE.Mesh(secFloorGeo, secFloorMat);
    secFloor.rotation.x = -Math.PI / 2;
    scene.add(secFloor);

    // Luz fraca na sala de segurança
    const secLight = new THREE.PointLight(0xffaa00, 2, 15);
    secLight.position.set(0, 3, 0);
    scene.add(secLight);

    // 2. Salão Principal (Conectado, maior)
    const hallFloorGeo = new THREE.PlaneGeometry(30, 30);
    texGround.repeat.set(3, 3);
    const hallFloorMat = new THREE.MeshStandardMaterial({ map: texGround });
    const hallFloor = new THREE.Mesh(hallFloorGeo, hallFloorMat);
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(0, 0, -20); // Atrás da sala de segurança
    scene.add(hallFloor);

    // 3. Paredes (Exemplo simples delimitando a area)
    // Parede Divisória com Porta de Segurança
    const wallGeo = new THREE.BoxGeometry(10, 5, 0.5);
    const doorMat = new THREE.MeshStandardMaterial({ map: texSecDoor });
    const wallDiv = new THREE.Mesh(wallGeo, doorMat);
    wallDiv.position.set(0, 2.5, -5); // Entre sala e salão
    scene.add(wallDiv);
    collisionObstacles.push(wallDiv);

    // Paredes externas (apenas visualização básica para o protótipo não ficar gigante)
    createWall(0, 2.5, 5, 10, 5, 0.5, texWall); // Fundo Sec
    createWall(-5, 2.5, 0, 0.5, 5, 10, texWall); // Esq Sec
    createWall(5, 2.5, 0, 0.5, 5, 10, texWall); // Dir Sec
}

function createWall(x, y, z, w, h, d, texture) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    collisionObstacles.push(mesh);
}

// --- Animatronics ---
function loadAnimatronics() {
    const bots = [
        { name: 'freddy', x: -5, z: -20, color: 0x663300 },
        { name: 'bonnie', x: 5, z: -20, color: 0x3300cc },
        { name: 'chica', x: -5, z: -15, color: 0xffff00 },
        { name: 'foxy', x: 5, z: -25, color: 0xcc0000 }
    ];

    bots.forEach(bot => {
        gltfLoader.load(`assets/models/${bot.name}.glb`, (gltf) => {
            const model = gltf.scene;
            model.position.set(bot.x, 0, bot.z);
            model.scale.set(1.5, 1.5, 1.5); // Ajuste de escala
            
            // Adicionar colisão simples (Box invisível)
            const box = new THREE.Box3().setFromObject(model);
            const helper = new THREE.Box3Helper(box, 0xff0000);
            // scene.add(helper); // Debug visual
            
            // Objeto para colisão lógica
            const collisionBox = new THREE.Mesh(
                new THREE.BoxGeometry(2, 4, 2),
                new THREE.MeshBasicMaterial({ visible: false })
            );
            collisionBox.position.copy(model.position);
            collisionBox.position.y = 2;
            scene.add(collisionBox);
            collisionObstacles.push(collisionBox);

            // Luz de destaque (terror)
            const light = new THREE.PointLight(bot.color, 3, 5);
            light.position.set(bot.x, 3, bot.z + 1);
            scene.add(light);

            scene.add(model);
        });
    });
}

// --- Lógica Multiplayer ---
// Carrega modelo de OUTRO jogador baseado na skin (1, 2 ou 3)
function addOtherPlayer(id, data) {
    const skinId = data.skin || 1; // Fallback
    gltfLoader.load(`assets/models/pl${skinId}.glb`, (gltf) => {
        const model = gltf.scene;
        model.userData.id = id;
        scene.add(model);
        otherPlayers[id] = model;
        
        // Atualiza posição inicial
        model.position.set(data.x, data.y, data.z);
        model.rotation.y = data.rotation;
    });
}

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) {
            addOtherPlayer(id, players[id]);
        }
    });
});

socket.on('newPlayer', (data) => {
    addOtherPlayer(data.id, data.player);
});

socket.on('playerMoved', (data) => {
    if (otherPlayers[data.id]) {
        // Interpolação simples poderia ser adicionada aqui
        otherPlayers[data.id].position.set(data.x, data.y, data.z);
        otherPlayers[data.id].rotation.y = data.rotation;
    }
});

socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

// --- Controles e Loop ---
createMap();
loadAnimatronics();
camera.position.y = 1.6; // Altura dos olhos

// Joystick (Movement)
const joystickManager = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white'
});

let moveForward = 0;
let moveSide = 0;

joystickManager.on('move', (evt, data) => {
    const forward = data.vector.y;
    const side = data.vector.x;
    moveForward = forward;
    moveSide = side;
});

joystickManager.on('end', () => {
    moveForward = 0;
    moveSide = 0;
});

// Touch (Camera Rotation)
let isDragging = false;
let previousTouchX = 0;
const touchZone = document.getElementById('touch-zone');

touchZone.addEventListener('touchstart', (e) => {
    isDragging = true;
    previousTouchX = e.touches[0].clientX;
}, { passive: false });

touchZone.addEventListener('touchmove', (e) => {
    if (isDragging) {
        const deltaX = e.touches[0].clientX - previousTouchX;
        camera.rotation.y -= deltaX * 0.005;
        previousTouchX = e.touches[0].clientX;
    }
}, { passive: false });

touchZone.addEventListener('touchend', () => {
    isDragging = false;
});

// Loop Principal
function animate() {
    requestAnimationFrame(animate);

    // Movimento do Player Local
    if (moveForward !== 0 || moveSide !== 0) {
        const speed = 0.1;
        const direction = new THREE.Vector3();
        
        // Calcula vetor de movimento baseado na rotação da câmera
        camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();

        const sideVector = new THREE.Vector3();
        sideVector.crossVectors(camera.up, direction).normalize();

        const nextPosition = camera.position.clone();
        nextPosition.addScaledVector(direction, moveForward * speed);
        nextPosition.addScaledVector(sideVector, moveSide * speed);

        // Checagem de colisão simplificada (apenas verifica se entra em objeto)
        const playerBox = new THREE.Box3().setFromCenterAndSize(nextPosition, new THREE.Vector3(0.5, 2, 0.5));
        let collision = false;
        
        for (const obs of collisionObstacles) {
            const obsBox = new THREE.Box3().setFromObject(obs);
            if (playerBox.intersectsBox(obsBox)) {
                collision = true;
                break;
            }
        }

        if (!collision) {
            camera.position.copy(nextPosition);
            
            // Envia para o servidor
            socket.emit('playerMovement', {
                x: camera.position.x,
                y: 0, // Mantém no chão visualmente
                z: camera.position.z,
                rotation: camera.rotation.y
            });
        }
    }

    renderer.render(scene, camera);
}

animate();

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
