const fileGrid = document.querySelector('.grid');
const fileInput = document.getElementById('fileInput');
const fab = document.querySelector('.fab');
const toolbar = document.querySelector('.toolbar');
const contextMenu = document.getElementById('contextMenu');

const imageViewer = document.getElementById('imageViewer');
const viewerImg = imageViewer.querySelector('.viewer-img');
const closeBtn = imageViewer.querySelector('.close-btn');
const prevBtn = imageViewer.querySelector('.prev-btn');
const nextBtn = imageViewer.querySelector('.next-btn');

let currentPath = "";
let selectedFiles = [];
let imageFiles = [];
let currentImageIndex = -1;

// === FUNKCJE GŁÓWNE ===

function renderFiles(items) {
  fileGrid.innerHTML = '';
  selectedFiles = [];
  imageFiles = items.filter(f => f.type === 'image');

  items.forEach(file => {
    const div = document.createElement('div');
    div.classList.add('file');
    div.dataset.filename = file.name;
    div.dataset.filetype = file.type;

    if (file.type === 'image') {
      const img = document.createElement('img');
      img.src = `/files/${encodeURIComponent(currentPath ? currentPath + '/' : '')}${encodeURIComponent(file.name)}`;
      img.alt = `Podgląd ${file.name}`;
      div.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.classList.add('file-icon');
      const icons = {
        document: '📄',
        dir: '📁',
        audio: '🎵',
        video: '🎬',
        archive: '📦',
        code: '💻',
        file: '📃',
      };
      icon.textContent = icons[file.type] || '📃';
      div.appendChild(icon);
    }

    const filenameDiv = document.createElement('div');
    filenameDiv.classList.add('filename');
    filenameDiv.textContent = file.name;
    filenameDiv.classList.add('filename');
    filenameDiv.textContent = file.name;
    filenameDiv.title = file.name;  // ← to pokaże pełną nazwę po najechaniu
    div.appendChild(filenameDiv);

    div.style.cursor = 'pointer';
    div.addEventListener('dblclick', () => {
    if (file.type === 'dir') {
        fetchFileList(currentPath ? currentPath + '/' + file.name : file.name);
    } else if (file.type === 'image') {
        const index = imageFiles.findIndex(f => f.name === file.name);
        if (index !== -1) openImageViewer(index);
    } else if (file.type === 'video') {
        openVideoViewer(`/files/${encodeURIComponent(currentPath ? currentPath + '/' : '')}${encodeURIComponent(file.name)}`);
    } else if (file.type === 'audio') {
        openAudioPlayer(`/files/${encodeURIComponent(currentPath ? currentPath + '/' : '')}${encodeURIComponent(file.name)}`);
    } else if (
        file.type === 'archive' ||
        file.type === 'code' ||
        file.type === 'file'
    ) {
        // Pobieranie przez otwarcie linku
        const link = document.createElement('a');
        link.href = `/files/${encodeURIComponent(currentPath ? currentPath + '/' : '')}${encodeURIComponent(file.name)}`;
        link.download = file.name;
        link.click();
    } else if (file.type === 'document') {
        // Możesz rozbudować to później, np. podgląd PDF albo TXT w overlay
        window.open(`/files/${encodeURIComponent(currentPath ? currentPath + '/' : '')}${encodeURIComponent(file.name)}`, '_blank');
    }
    });


    div.addEventListener('click', (e) => {
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        if (div.classList.contains('selected')) {
          div.classList.remove('selected');
          selectedFiles = selectedFiles.filter(f => f !== div);
        } else {
          div.classList.add('selected');
          selectedFiles.push(div);
        }
      } else {
        clearSelection();
        div.classList.add('selected');
        selectedFiles = [div];
      }

      contextMenu.style.display = 'none';
    });

    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!div.classList.contains('selected')) {
        clearSelection();
        div.classList.add('selected');
        selectedFiles = [div];
      }

      contextMenu.style.left = `${e.pageX}px`;
      contextMenu.style.top = `${e.pageY}px`;
      contextMenu.style.display = 'block';
    });

    fileGrid.appendChild(div);
  });
}

function clearSelection() {
  selectedFiles.forEach(f => f.classList.remove('selected'));
  selectedFiles = [];
}

async function fetchFileList(path = "") {
  try {
    const response = await fetch(`/api/list?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error(`Błąd pobierania plików: ${response.status}`);
    const data = await response.json();
    currentPath = data.path;
    renderFiles(data.items);
  } catch (error) {
    alert(error.message);
  }
}

async function uploadFiles(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      alert(`Błąd uploadu: ${error.error || response.statusText}`);
      return;
    }
    const result = await response.json();
    alert(`Przesłano pliki: ${result.saved.join(', ')}`);
    fetchFileList(currentPath);
  } catch (e) {
    alert(`Błąd sieci: ${e.message}`);
  } finally {
    fileInput.value = '';
  }
}

// === PODGLĄD OBRAZÓW ===

function openImageViewer(index) {
  if (index < 0 || index >= imageFiles.length) return;
  const file = imageFiles[index];
  const imageUrl = `/files/${encodeURIComponent(currentPath ? currentPath + '/' : '')}${encodeURIComponent(file.name)}`;
  viewerImg.src = imageUrl;
  viewerImg.alt = file.name;
  imageViewer.classList.remove('hidden');
  currentImageIndex = index;
}
function openVideoViewer(videoUrl) {
  const overlay = document.createElement('div');
  overlay.classList.add('overlay');
  overlay.innerHTML = `
    <div class="viewer">
      <video src="${videoUrl}" controls autoplay style="max-width:90vw; max-height:90vh;"></video>
      <button class="close-btn">✖</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.close-btn').addEventListener('click', () => overlay.remove());
}
function openAudioPlayer(audioUrl) {
  const overlay = document.createElement('div');
  overlay.classList.add('overlay');
  overlay.innerHTML = `
    <div class="viewer">
      <audio src="${audioUrl}" controls autoplay style="width:100%;"></audio>
      <button class="close-btn">✖</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.close-btn').addEventListener('click', () => overlay.remove());
}


function closeImageViewer() {
  imageViewer.classList.add('hidden');
  viewerImg.src = "";
  currentImageIndex = -1;
}

function showPrevImage() {
  if (currentImageIndex > 0) openImageViewer(currentImageIndex - 1);
}
function showNextImage() {
  if (currentImageIndex < imageFiles.length - 1) openImageViewer(currentImageIndex + 1);
}

closeBtn.addEventListener('click', closeImageViewer);
prevBtn.addEventListener('click', showPrevImage);
nextBtn.addEventListener('click', showNextImage);

document.addEventListener('keydown', (e) => {
  if (imageViewer.classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') showPrevImage();
  if (e.key === 'ArrowRight') showNextImage();
  if (e.key === 'Escape') closeImageViewer();
});

// === INNE ZDARZENIA ===

document.addEventListener('click', (e) => {
  const clickedInsideToolbar = toolbar && toolbar.contains(e.target);
  const clickedInsideMenu = contextMenu.contains(e.target);
  const clickedInsideFile = e.target.closest('.file');

  if (!clickedInsideToolbar && !clickedInsideMenu && !clickedInsideFile) {
    clearSelection();
  }

  if (!clickedInsideMenu) {
    contextMenu.style.display = 'none';
  }
});

window.addEventListener('scroll', () => {
  contextMenu.style.display = 'none';
});
window.addEventListener('resize', () => {
  contextMenu.style.display = 'none';
});

fileGrid.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileGrid.classList.add('dragover');
});
fileGrid.addEventListener('dragleave', () => {
  fileGrid.classList.remove('dragover');
});
fileGrid.addEventListener('drop', async (e) => {
  e.preventDefault();
  fileGrid.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length) await uploadFiles(files);
});

fab.addEventListener('click', () => {
  fileInput.value = null;
  fileInput.click();
});
fileInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (files.length) await uploadFiles(files);
});





// Pobieranie jednego pliku
function downloadFile(path) {
  const a = document.createElement('a');
  a.href = `/files/${encodeURIComponent(path)}`;
  a.download = '';

  // const a = document.createElement('a');
  // a.href = `/files/${encodeURIComponent(currentPath ? currentPath + '/' : '')}${encodeURIComponent(file.name)}`;
  // a.download = file.name;

  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Pobieranie zaznaczonych plików
function downloadSelectedFiles() {
  const selected = document.querySelectorAll('.file.selected');
  if (selected.length === 0) {
    alert('Nie wybrano żadnych plików do pobrania.');
    return;
  }

  selected.forEach(file => {
    const fileName = file.dataset.filename;
    const fileType = file.dataset.filetype;
    if (fileType !== 'dir') {
      const fullPath = currentPath ? `${currentPath}/${fileName}` : fileName;
      downloadFile(fullPath);
    }
  });
}

// Obsługa przycisku na górze
document.getElementById('downloadBtn').addEventListener('click', downloadSelectedFiles);
document.getElementById('deleteBtn').addEventListener('click', (e) => {
  e.preventDefault();
  deleteSelectedFiles();
});

// Obsługa w menu kontekstowym
function handleContextDownload() {
  const selectedFile = document.querySelector('.file.selected');

  if (selectedFile && selectedFile.dataset.filetype !== 'dir') {
    const fileName = selectedFile.dataset.filename;
    const fullPath = currentPath ? `${currentPath}/${fileName}` : fileName;
    downloadFile(fullPath);
  } else {
    alert('Nie można pobrać folderu.');
  }
}




async function handleContextDelete() {
  const selectedFile = document.querySelector('.file.selected');
  if (!selectedFile) {
    alert("Nie wybrano pliku do usunięcia.");
    return;
  }

  const fileType = selectedFile.dataset.filetype;
  if (fileType === 'dir') {
    alert("Nie można usunąć folderu.");
    return;
  }

  const fileName = selectedFile.dataset.filename;
  const fullPath = currentPath ? `${currentPath}/${fileName}` : fileName;

  if (!confirm(`Czy na pewno chcesz usunąć plik "${fileName}"?`)) return;

  try {
    const response = await fetch(`/delete/${encodeURIComponent(fullPath)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Błąd serwera: ${response.status}`);
    }

    const result = await response.json();
    console.log("Plik usunięty:", result.message);
    // alert(`Plik został przeniesiony do folderu 'deleted'.`);
    fetchFileList(currentPath);  // Odśwież widok
  } catch (error) {
    console.error("Błąd podczas usuwania:", error);
    alert(`Nie udało się usunąć pliku: ${error.message}`);
  }
}






async function deleteSelectedFiles() {
  const selected = document.querySelectorAll('.file.selected');
  if (selected.length === 0) {
    alert('Nie wybrano żadnych plików do usunięcia.');
    return;
  }

  // Filtrujemy tylko pliki (nie foldery)
  const filesToDelete = Array.from(selected).filter(f => f.dataset.filetype !== 'dir');
  if (filesToDelete.length === 0) {
    alert('Nie można usuwać folderów.');
    return;
  }

  if (!confirm(`Czy na pewno chcesz usunąć ${filesToDelete.length} plik(ów)?`)) {
    return;
  }

  try {
    // Usuwamy pliki kolejno (można też równolegle z Promise.all)
    for (const fileDiv of filesToDelete) {
      const fileName = fileDiv.dataset.filename;
      const fullPath = currentPath ? `${currentPath}/${fileName}` : fileName;

      const response = await fetch(`/delete/${encodeURIComponent(fullPath)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Błąd przy usuwaniu ${fileName}: ${errorText || response.statusText}`);
      }
    }

    alert(`Usunięto ${filesToDelete.length} plik(ów).`);
    fetchFileList(currentPath); // odśwież widok
  } catch (error) {
    alert(`Błąd podczas usuwania: ${error.message}`);
  }
}








// === START ===
fetchFileList();
