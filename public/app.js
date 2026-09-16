// ============================================================================
// DIVIDER — UI & State Management (2,615 lines)
// ============================================================================
// Core DOM utilities, navigation, modalities, database operations, renderers

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  Object.keys(attrs).forEach(k => {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style') Object.assign(el.style, attrs[k]);
    else if (k.startsWith('on')) el[k] = attrs[k];
    else el[k] = attrs[k];
  });
  kids.forEach(kid => {
    if (typeof kid === 'string') el.appendChild(document.createTextNode(kid));
    else if (kid) el.appendChild(kid);
  });
  return el;
};

const app = (sel, tree) => document.querySelector(sel).appendChild(tree);
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 9);
const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);

const ymd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (d) => {
  const now = new Date();
  const then = new Date(d);
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return then.toLocaleDateString();
};

const plural = (n, s) => n === 1 ? s : s + 's';

// ============================================================================
// Modal System & State
// ============================================================================

let modalLocked = false;
let currentModal = null;

const showModal = (title, content, { footer = null, small = false, lock = false } = {}) => {
  if (modalLocked && !lock) return;
  if (lock) modalLocked = true;

  const modal = h('div', { class: 'modal' + (small ? ' modal-small' : '') },
    h('div', { class: 'modal-content' },
      h('div', { class: 'modal-header' },
        h('h2', {}, title),
        h('button', { class: 'btn-close', onclick: () => closeModal() }, '✕')
      ),
      h('div', { class: 'modal-body' }, content),
      footer ? h('div', { class: 'modal-footer' }, footer) : null
    )
  );

  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => {
    if (e.target === backdrop && !modalLocked) closeModal();
  }});

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  currentModal = { el: modal, backdrop, lock };
};

const closeModal = () => {
  if (!currentModal) return;
  currentModal.el.remove();
  currentModal.backdrop.remove();
  modalLocked = false;
  currentModal = null;
};

// ============================================================================
// State Management
// ============================================================================

const S = {
  profile: null,
  profileId: null,
  semester: null,
  course: null,
  sets: [],
  selectedSet: null,
  modalities: {},
  view: 'auth',
  materials: [],
  formatsEnabled: {}
};

// ============================================================================
// Database & Storage (Supabase Stubs)
// ============================================================================

const clone = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
};

const supabaseUrl = 'https://YOUR_PROJECT.supabase.co';
const supabaseKey = 'YOUR_ANON_KEY';

const dbCall = async (table, op, filter = {}, data = null) => {
  // Stub for Supabase integration
  // In production, this would use supabase.from(table).select/insert/update/delete()
  // For local demo, return mock data
  return [];
};

const loadProfiles = async (userId) => {
  // Stub: return mock profiles
  return [
    {
      id: uid(),
      user_id: userId,
      name: 'Demo Profile',
      created_at: ymd()
    }
  ];
};

const loadProfileData = async (profileId) => {
  // Stub: return structure with semesters, courses, sets
  return {
    semesters: [
      {
        id: uid(),
        profile_id: profileId,
        name: 'Fall 2026',
        created_at: ymd()
      }
    ],
    courses: [
      {
        id: uid(),
        semester_id: null,
        profile_id: profileId,
        name: 'Biology 101',
        created_at: ymd()
      }
    ],
    sets: [],
    progress: {}
  };
};

const sourcesFor = async (courseId) => {
  return [];
};

const setsFor = async (courseId) => {
  return [];
};

const progressFor = async (setId) => {
  return {};
};

const saveProgress = async (userId, setId, progress) => {
  // Stub: persist spaced rep progress
};

// ============================================================================
// Activity Tracking & Streaks
// ============================================================================

const activityLog = {};

const logActivity = (courseId) => {
  const today = ymd();
  if (!activityLog[courseId]) activityLog[courseId] = {};
  activityLog[courseId][today] = true;
};

const getStreak = (courseId) => {
  const log = activityLog[courseId] || {};
  let streak = 0;
  let d = new Date();

  for (let i = 0; i < 365; i++) {
    const dateStr = ymd.call({ getFullYear: () => d.getFullYear(), getMonth: () => d.getMonth(), getDate: () => d.getDate() });
    if (!log[dateStr]) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
};

// ============================================================================
// Authentication Flow
// ============================================================================

const renderAuth = () => {
  const root = h('div', { class: 'auth-container' },
    h('div', { class: 'auth-box' },
      h('h1', { class: 'brand' }, 'Divider'),
      h('p', { class: 'tagline' }, 'AI-powered study sets from your class materials'),
      h('button', { class: 'btn btn-primary', onclick: renderSignIn }, 'Sign In'),
      h('button', { class: 'btn btn-secondary', onclick: renderCreateProfile }, 'Create an account'),
      h('button', { class: 'btn btn-tertiary', onclick: () => {
        S.profileId = uid();
        S.profile = { id: S.profileId, name: 'Demo User' };
        go('home');
      }}, 'Demo (no signup)')
    )
  );
  return root;
};

const renderSignIn = () => {
  showModal('Sign In', h('form', { onsubmit: (e) => {
    e.preventDefault();
    const email = qs('input[type=email]').value;
    S.profileId = uid();
    S.profile = { id: S.profileId, name: email };
    closeModal();
    go('home');
  }},
    h('input', { type: 'email', placeholder: 'Email', required: true }),
    h('input', { type: 'password', placeholder: 'Password', required: true }),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Sign In')
  ), {
    footer: h('div', {},
      h('p', {}, "Don't have an account? "),
      h('button', { class: 'btn-text', onclick: () => {
        closeModal();
        renderCreateProfile();
      }}, 'Create one')
    )
  });
};

const renderCreateProfile = () => {
  showModal('Create Account', h('form', { onsubmit: (e) => {
    e.preventDefault();
    const name = qs('input[placeholder="Full name"]').value;
    const email = qs('input[type=email]').value;
    S.profileId = uid();
    S.profile = { id: S.profileId, name, email };
    closeModal();
    go('home');
  }},
    h('input', { placeholder: 'Full name', required: true }),
    h('input', { type: 'email', placeholder: 'Email', required: true }),
    h('input', { type: 'password', placeholder: 'Password', required: true }),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Create Account')
  ));
};

// ============================================================================
// Shell & Navigation
// ============================================================================

const renderShell = (content) => {
  return h('div', { class: 'shell' },
    h('header', { class: 'top-nav' },
      h('div', { class: 'nav-left' },
        h('h1', { class: 'brand-small', onclick: () => go('home') }, 'Divider'),
        S.semester ? h('span', { class: 'nav-breadcrumb' }, S.semester.name) : null
      ),
      h('div', { class: 'nav-right' },
        h('button', { class: 'btn-icon', onclick: () => go('profile') }, '👤'),
        h('button', { class: 'btn-icon', onclick: () => {
          S.profile = null;
          S.profileId = null;
          go('auth');
        }}, '🚪')
      )
    ),
    h('main', { class: 'main-content' }, content)
  );
};

const go = async (view) => {
  S.view = view;
  const root = document.querySelector('#app');
  clear(root);

  let content;
  switch (view) {
    case 'auth':
      content = renderAuth();
      break;
    case 'home':
      content = renderShell(renderHome());
      break;
    case 'semester':
      content = renderShell(renderSemester());
      break;
    case 'course':
      content = renderShell(renderCourse());
      break;
    case 'study':
      content = renderShell(renderStudy());
      break;
    case 'profile':
      content = renderShell(renderProfile());
      break;
    default:
      content = h('div', {}, 'Not found');
  }

  app('#app', content);
};

// ============================================================================
// Home: Semesters & Courses
// ============================================================================

const renderHome = () => {
  const semesters = [
    { id: uid(), name: 'Fall 2026' },
    { id: uid(), name: 'Spring 2027' }
  ];

  return h('div', { class: 'home-view' },
    h('div', { class: 'header-row' },
      h('h2', {}, 'Your Semesters')
    ),
    h('div', { class: 'semester-grid' },
      ...semesters.map(sem => h('div', { class: 'card semester-card', onclick: () => {
        S.semester = sem;
        go('semester');
      }},
        h('h3', {}, sem.name),
        h('p', { class: 'text-secondary' }, '3 courses'),
        h('div', { class: 'card-actions' },
          h('button', { class: 'btn-icon', onclick: (e) => {
            e.stopPropagation();
            renameSemester(sem.id);
          }}, '✏️'),
          h('button', { class: 'btn-icon', onclick: (e) => {
            e.stopPropagation();
            deleteSemester(sem.id);
          }}, '🗑️')
        )
      )),
      h('div', { class: 'card add-card', onclick: newSemester },
        h('span', {}, '+ New Semester')
      )
    )
  );
};

const newSemester = () => {
  showModal('New Semester', h('form', { onsubmit: (e) => {
    e.preventDefault();
    const name = qs('input').value;
    const sem = { id: uid(), name, created_at: ymd() };
    S.semester = sem;
    closeModal();
    go('semester');
  }},
    h('input', { placeholder: 'Semester name', required: true, autofocus: true }),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Create')
  ), { small: true });
};

const renameSemester = (id) => {
  showModal('Rename Semester', h('form', { onsubmit: (e) => {
    e.preventDefault();
    const newName = qs('input').value;
    if (S.semester && S.semester.id === id) S.semester.name = newName;
    closeModal();
    go('home');
  }},
    h('input', { placeholder: 'New name', required: true, autofocus: true }),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')
  ), { small: true });
};

const deleteSemester = (id) => {
  showModal('Delete Semester?', h('p', {}, 'This will delete all courses and study sets in this semester.'), {
    footer: h('div', { class: 'modal-button-group' },
      h('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn btn-danger', onclick: () => {
        closeModal();
        go('home');
      }}, 'Delete')
    )
  });
};

// ============================================================================
// Semester: Courses
// ============================================================================

const renderSemester = () => {
  const courses = [
    { id: uid(), name: 'Biology 101', created_at: ymd() },
    { id: uid(), name: 'History 201', created_at: ymd() }
  ];

  return h('div', { class: 'semester-view' },
    h('div', { class: 'header-row' },
      h('h2', {}, S.semester.name),
      h('button', { class: 'btn btn-primary', onclick: newCourse }, '+ Add Course')
    ),
    h('div', { class: 'course-grid' },
      ...courses.map(course => h('div', { class: 'card course-card', onclick: () => {
        S.course = course;
        go('course');
      }},
        h('h3', {}, course.name),
        h('p', { class: 'text-secondary' }, '5 study sets'),
        h('div', { class: 'card-actions' },
          h('button', { class: 'btn-icon', onclick: (e) => {
            e.stopPropagation();
            wipeCourse(course.id);
          }}, '🗑️')
        )
      )),
      h('div', { class: 'card add-card', onclick: newCourse },
        h('span', {}, '+ New Course')
      )
    )
  );
};

const newCourse = () => {
  showModal('New Course', h('form', { onsubmit: (e) => {
    e.preventDefault();
    const name = qs('input').value;
    const course = { id: uid(), name, semester_id: S.semester.id, created_at: ymd() };
    S.course = course;
    closeModal();
    go('course');
  }},
    h('input', { placeholder: 'Course name', required: true, autofocus: true }),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Create')
  ), { small: true });
};

const wipeCourse = (id) => {
  showModal('Delete Course?', h('p', {}, 'This will delete all study sets in this course.'), {
    footer: h('div', { class: 'modal-button-group' },
      h('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn btn-danger', onclick: () => {
        closeModal();
        go('semester');
      }}, 'Delete')
    )
  });
};

// ============================================================================
// Course: Study Sets & Material Upload
// ============================================================================

const renderCourse = () => {
  const streak = getStreak(S.course.id);

  return h('div', { class: 'course-view' },
    h('div', { class: 'course-header' },
      h('h2', {}, S.course.name),
      h('div', { class: 'stats' },
        h('span', {}, `${streak} day streak 🔥`),
        h('span', {}, '12 study sets')
      )
    ),

    h('section', { class: 'material-section' },
      h('h3', {}, 'Add Materials'),
      h('div', { class: 'upload-zone', ondrop: (e) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }, ondragover: (e) => {
        e.preventDefault();
        e.target.classList.add('drag-active');
      }, ondragleave: (e) => {
        e.target.classList.remove('drag-active');
      }},
        h('input', { type: 'file', id: 'file-upload', multiple: true, onchange: (e) => addFiles(e.target.files), style: { display: 'none' } }),
        h('button', { class: 'btn btn-secondary', onclick: () => document.getElementById('file-upload').click() }, '📎 Upload PDF, DOCX, or PPTX'),
        h('p', { class: 'text-secondary' }, 'or drag files here')
      ),
      h('textarea', { id: 'paste-text', placeholder: 'Or paste text, lecture notes, etc.', rows: 4 }),
      h('button', { class: 'btn btn-secondary', onclick: () => {
        const text = document.getElementById('paste-text').value;
        if (text) addText(text);
      }}, '✍️ Add Text')
    ),

    h('section', { class: 'sets-section' },
      h('h3', {}, 'Study Sets'),
      h('div', { class: 'sets-list' },
        h('div', { class: 'set-item' },
          h('h4', {}, 'Congress of Vienna'),
          h('p', { class: 'text-secondary' }, 'Multiple choice • Created 2d ago'),
          h('button', { class: 'btn btn-primary', onclick: () => {
            S.selectedSet = { id: uid(), name: 'Congress of Vienna' };
            go('study');
          }}, 'Study')
        )
      )
    )
  );
};

const addFiles = async (files) => {
  for (let file of files) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      S.materials.push({
        id: uid(),
        type: 'file',
        name: file.name,
        data: e.target.result
      });
      showStudyModal();
    };
    reader.readAsArrayBuffer(file);
  }
};

const addText = (text) => {
  S.materials.push({
    id: uid(),
    type: 'text',
    content: text
  });
  showStudyModal();
};

const addRecording = async () => {
  // Stub: use Web Audio API to record, then transcribe
};

const showStudyModal = () => {
  showModal('Create Study Set', h('div', {},
    h('div', { class: 'study-wizard' },
      h('h3', {}, 'Step 1: Choose Format'),
      h('div', { class: 'format-grid' },
        ['Multiple Choice', 'True/False', 'Fill in the Blank', 'Flashcards', 'Essay', 'Matching', 'Timeline'].map(fmt => h('button', {
          class: 'format-btn' + (S.formatsEnabled[fmt] ? ' selected' : ''),
          onclick: (e) => {
            e.target.classList.toggle('selected');
            S.formatsEnabled[fmt] = !S.formatsEnabled[fmt];
          }
        }, fmt))
      ),
      h('h3', {}, 'Step 2: Number of Questions'),
      h('input', { type: 'number', min: 5, max: 50, value: 15, placeholder: 'Number of questions' }),
      h('h3', {}, 'Step 3: Difficulty'),
      h('select', {},
        h('option', {}, 'Balanced'),
        h('option', {}, 'Easy'),
        h('option', {}, 'Hard')
      )
    )
  ), {
    footer: h('div', { class: 'modal-button-group' },
      h('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn btn-primary', onclick: () => generateStudySet() }, 'Build')
    ),
    lock: true
  });
};

const generateStudySet = async () => {
  const elapsed = h('span', { class: 'elapsed-time' }, '0s');
  const status = h('div', { class: 'generation-status' },
    h('div', { class: 'spinner' }),
    h('p', {}, 'Generating your study set...'),
    h('p', { class: 'text-secondary' }, 'Time elapsed: ', elapsed)
  );

  closeModal();
  showModal('Generating...', status, { lock: true });

  let seconds = 0;
  const timer = setInterval(() => {
    seconds++;
    elapsed.textContent = seconds + 's';
  }, 1000);

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materials: S.materials,
        formats: Object.keys(S.formatsEnabled).filter(k => S.formatsEnabled[k]),
        numQuestions: 15
      })
    });

    clearInterval(timer);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Generation failed');
    }

    const result = await response.json();
    S.selectedSet = result;
    S.materials = [];
    closeModal();
    go('study');
  } catch (err) {
    clearInterval(timer);
    logFailure(err, S.materials);
    showModal('Generation Failed', h('div', {},
      h('p', {}, sampleError(err)),
      h('p', { class: 'text-secondary' }, 'Check your API key and try again.')
    ), {
      footer: h('div', { class: 'modal-button-group' },
        h('button', { class: 'btn btn-primary', onclick: () => {
          closeModal();
          showStudyModal();
        }}, 'Try Again'),
        h('button', { class: 'btn btn-secondary', onclick: closeModal }, 'Back')
      )
    });
  }
};

// ============================================================================
// Study Set Renderers
// ============================================================================

const renderStudy = () => {
  if (!S.selectedSet) return h('div', {}, 'No set selected');

  const set = S.selectedSet;
  const view = h('div', { class: 'study-view' },
    h('div', { class: 'study-header' },
      h('h2', {}, set.name || 'Study Set'),
      h('div', { class: 'study-stats' },
        h('span', {}, `${set.questions ? set.questions.length : 0} questions`)
      )
    )
  );

  if (set.questions) {
    set.questions.forEach((q, i) => {
      const qView = renderQuestion(q, i);
      view.appendChild(qView);
    });
  }

  view.appendChild(h('div', { class: 'study-footer' },
    h('button', { class: 'btn btn-secondary', onclick: () => go('course') }, '← Back'),
    h('button', { class: 'btn btn-primary', onclick: () => exportSet(set) }, '📥 Export')
  ));

  return view;
};

const renderQuestion = (q, index) => {
  const container = h('div', { class: 'question-card' },
    h('div', { class: 'question-num' }, `${index + 1}. `),
    h('div', { class: 'question-content' }, q.prompt || q.text || 'Question')
  );

  if (q.type === 'multiple-choice' || q.type === 'choice') {
    container.appendChild(renderChoice(q));
  } else if (q.type === 'true-false') {
    container.appendChild(renderTF(q));
  } else if (q.type === 'fill-blank' || q.type === 'cloze') {
    container.appendChild(renderCloze(q));
  } else if (q.type === 'flashcard') {
    container.appendChild(renderFlash(q));
  } else if (q.type === 'matching') {
    container.appendChild(renderMatch(q));
  } else if (q.type === 'open-ended') {
    container.appendChild(renderOpen(q));
  }

  return container;
};

const renderChoice = (q) => {
  const options = q.options || [];
  return h('div', { class: 'choice-options' },
    ...options.map((opt, i) => h('button', { class: 'option-btn', onclick: (e) => {
      qs('.choice-options', e.target.parentElement).querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
    }}, String.fromCharCode(65 + i) + '. ' + opt))
  );
};

const renderTF = (q) => {
  return h('div', { class: 'true-false' },
    h('button', { class: 'btn-option', onclick: (e) => {
      e.target.parentElement.querySelectorAll('.btn-option').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
    }}, 'True'),
    h('button', { class: 'btn-option', onclick: (e) => {
      e.target.parentElement.querySelectorAll('.btn-option').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
    }}, 'False')
  );
};

const renderCloze = (q) => {
  const text = q.text || '';
  const blanks = q.blanks || [];
  return h('div', { class: 'cloze-text' },
    h('p', {},
      ...text.split('_____').map((part, i) => [
        document.createTextNode(part),
        i < blanks.length ? h('input', { class: 'cloze-blank', type: 'text', placeholder: 'Answer' }) : null
      ]).flat()
    )
  );
};

const renderFlash = (q) => {
  const card = h('div', { class: 'flashcard', style: { cursor: 'pointer' }, onclick: function() {
    this.classList.toggle('flipped');
  }},
    h('div', { class: 'flash-front' }, q.front || 'Front'),
    h('div', { class: 'flash-back' }, q.back || 'Back')
  );
  return card;
};

const renderMatch = (q) => {
  const pairs = q.pairs || [];
  const left = pairs.map(p => p.left);
  const right = shuffle([...pairs.map(p => p.right)]);

  return h('div', { class: 'matching-pairs' },
    h('div', { class: 'match-left' },
      ...left.map(item => h('div', { class: 'match-item' }, item))
    ),
    h('div', { class: 'match-right' },
      ...right.map(item => h('div', { class: 'match-item', draggable: true }, item))
    )
  );
};

const renderOpen = (q) => {
  return h('div', { class: 'open-response' },
    h('textarea', { placeholder: 'Your answer...', rows: 4 })
  );
};

// ============================================================================
// Progress & Spaced Repetition
// ============================================================================

const renderReview = () => {
  // Review queue for all flashcard sets
  return h('div', { class: 'review-view' },
    h('h2', {}, 'Review Queue'),
    h('p', {}, 'No cards due right now. Great job!')
  );
};

// ============================================================================
// Profile & Settings
// ============================================================================

const renderProfile = () => {
  return h('div', { class: 'profile-view' },
    h('h2', {}, 'Profile'),
    h('div', { class: 'profile-info' },
      h('p', {}, 'Signed in as: ' + (S.profile ? S.profile.name : 'Guest')),
      h('p', { class: 'text-secondary' }, 'Email: ' + (S.profile ? S.profile.email : 'not set'))
    ),
    h('button', { class: 'btn btn-danger', onclick: () => {
      S.profile = null;
      S.profileId = null;
      go('auth');
    }}, 'Sign Out')
  );
};

// ============================================================================
// Export & Utilities
// ============================================================================

const exportSet = (set) => {
  let markdown = `# ${set.name || 'Study Set'}\n\n`;

  if (set.questions) {
    set.questions.forEach((q, i) => {
      markdown += `## ${i + 1}. ${q.prompt || q.text || 'Question'}\n\n`;

      if (q.options) {
        q.options.forEach((opt, j) => {
          markdown += `${String.fromCharCode(65 + j)}. ${opt}\n`;
        });
        markdown += `\n**Answer:** ${String.fromCharCode(65 + (q.correct || 0))}\n\n`;
      }
    });
  }

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (set.name || 'study-set').toLowerCase().replace(/\s+/g, '-') + '.md';
  a.click();
};

// ============================================================================
// Error Handling
// ============================================================================

const SAMPLE_ERRORS = {
  'ANTHROPIC_API_KEY': 'Your API key isn\'t set. Check your .env file.',
  'Invalid API Key': 'Your API key is invalid or expired.',
  'Unauthorized': 'You\'re not authorized. Check your API key.',
  '401': 'Authentication failed. Check your API key.',
  '429': 'Too many requests. Wait a moment and try again.',
  '500': 'Claude service error. Try again in a moment.',
  'timeout': 'Request took too long. Try with less material.',
  'ECONNREFUSED': 'Can\'t connect to Claude. Check your internet.',
  'budget': 'You\'ve hit your API budget limit.'
};

const sampleError = (err) => {
  const msg = err.message || String(err);
  for (const [key, sample] of Object.entries(SAMPLE_ERRORS)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) {
      return sample;
    }
  }
  return 'Something went wrong. Try again or check the logs.';
};

const logFailure = (err, materials) => {
  const log = {
    timestamp: new Date().toISOString(),
    error: err.message || String(err),
    materialCount: (materials || []).length,
    // Don't log actual content to avoid exposing material
  };
  console.error('Generation failed:', log);
};

// ============================================================================
// Initialization
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  go('auth');
});
