document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  // Confirmation modal elements
  const confirmModal = document.getElementById('confirm-modal');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  // Show a custom confirmation modal. Returns a Promise<boolean>.
  function showConfirm(message) {
    return new Promise((resolve) => {
      if (!confirmModal) {
        // Fallback to native confirm if modal not present
        return resolve(window.confirm(message));
      }

      confirmMessage.textContent = message;
      // show overlay (removes display:none) then add 'open' on next frame so the
      // inner modal can animate from its initial transform/opacity values.
      confirmModal.classList.remove('hidden');
      requestAnimationFrame(() => {
        // trigger reflow then open
        // (reading offsetHeight forces layout in some engines)
        void confirmModal.offsetHeight;
        confirmModal.classList.add('open');

        // focus the primary action for accessibility after it's visible
        if (confirmOk && typeof confirmOk.focus === 'function') {
          setTimeout(() => {
            try {
              confirmOk.focus({ preventScroll: true });
            } catch (err) {
              try { confirmOk.focus(); } catch (/*ignored*/e) {}
            }
          }, 50);
        }
      });

      function cleanup(result) {
        confirmOk.removeEventListener('click', onOk);
        confirmCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKeydown);

        // play close animation by removing the 'open' class then wait for the transition
        confirmModal.classList.remove('open');

        const inner = confirmModal.querySelector('.confirm-modal');
        let finished = false;

        function finishClose() {
          if (finished) return;
          finished = true;
          // actually hide overlay
          confirmModal.classList.add('hidden');
          inner.removeEventListener('transitionend', onTransitionEnd);
          clearTimeout(timeoutId);
          resolve(result);
        }

        function onTransitionEnd(e) {
          // ensure it's the opacity/transform transition on the inner modal
          if (e.target === inner) finishClose();
        }

        // fallback in case transitionend doesn't fire
        const timeoutId = setTimeout(finishClose, 350);
        inner.addEventListener('transitionend', onTransitionEnd);
      }

      function onOk() {
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      function onKeydown(e) {
        if (e.key === 'Escape') cleanup(false);
      }

      confirmOk.addEventListener('click', onOk);
      confirmCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKeydown);
    });
  }

  // Create a participant <li> element and wire up its delete handler.
  function createParticipantListItem(activityCard, activityName, email) {
    const listEl = activityCard.querySelector('.participants-list');
    const li = document.createElement('li');
    li.className = 'participant-item';

    const local = String(email).split('@')[0] || '';
    const initials = local.slice(0, 2).toUpperCase();

    li.innerHTML = `
      <span class="avatar">${initials}</span>
      <span class="participant-email">${email}</span>
      <button class="delete-btn" title="Remove participant" aria-label="Remove ${email}">\u2716</button>
    `;

    const deleteBtn = li.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const confirmed = await showConfirm(`Remove ${email} from ${activityName}?`);
      if (!confirmed) return;

      try {
        const resp = await fetch(`/activities/${encodeURIComponent(activityName)}/participants?email=${encodeURIComponent(email)}`, {
          method: 'DELETE'
        });

        const resJson = await resp.json();
        if (resp.ok) {
          // update availability count (removing a participant frees a spot)
          const availEl = activityCard.querySelector('.availability-count');
          if (availEl) {
            const cur = parseInt(availEl.textContent, 10) || 0;
            availEl.textContent = String(cur + 1);
          }

          // remove the participant from the DOM
          li.remove();

          // if no participants remain, show the placeholder
          const remaining = listEl.querySelectorAll('.participant-item').length;
          if (remaining === 0) {
            const none = document.createElement('li');
            none.className = 'no-participants';
            none.textContent = 'No participants yet';
            listEl.appendChild(none);
          }
        } else {
          messageDiv.textContent = resJson.detail || resJson.message || 'Failed to remove participant';
          messageDiv.className = 'error';
          messageDiv.classList.remove('hidden');
          setTimeout(() => messageDiv.classList.add('hidden'), 5000);
        }
      } catch (err) {
        console.error('Error removing participant:', err);
        messageDiv.textContent = 'Failed to remove participant. See console for details.';
        messageDiv.className = 'error';
        messageDiv.classList.remove('hidden');
        setTimeout(() => messageDiv.classList.add('hidden'), 5000);
      }
    });

    return li;
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft = details.max_participants - details.participants.length;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> <span class="availability-count">${spotsLeft}</span> spots left</p>

          <div class="participants">
            <h5>Participants</h5>
            <ul class="participants-list">
              <!-- participant items will be injected here -->
            </ul>
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Populate participants list
        const listEl = activityCard.querySelector(".participants-list");
        if (Array.isArray(details.participants) && details.participants.length > 0) {
          details.participants.forEach((p) => {
            const item = createParticipantListItem(activityCard, name, p);
            listEl.appendChild(item);
          });
        } else {
          const li = document.createElement("li");
          li.className = "no-participants";
          li.textContent = "No participants yet";
          listEl.appendChild(li);
        }

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });
    } catch (error) {
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        messageDiv.textContent = result.message;
        messageDiv.className = "success";
        signupForm.reset();

        // Update the UI immediately so the new participant is visible without a page reload.
        // Find the activity card for the chosen activity
        const cards = Array.from(document.querySelectorAll('.activity-card'));
        const card = cards.find(c => {
          const h = c.querySelector('h4');
          return h && h.textContent === activity;
        });

        if (card) {
          // remove 'no-participants' placeholder if present
          const listEl = card.querySelector('.participants-list');
          const placeholder = listEl.querySelector('.no-participants');
          if (placeholder) placeholder.remove();

          // append the new participant item
          const newItem = createParticipantListItem(card, activity, email);
          listEl.appendChild(newItem);

          // decrement availability
          const availEl = card.querySelector('.availability-count');
          if (availEl) {
            const cur = parseInt(availEl.textContent, 10) || 0;
            availEl.textContent = String(Math.max(0, cur - 1));
          }
        }
      } else {
        messageDiv.textContent = result.detail || "An error occurred";
        messageDiv.className = "error";
      }

      messageDiv.classList.remove("hidden");

      // Hide message after 5 seconds
      setTimeout(() => {
        messageDiv.classList.add("hidden");
      }, 5000);
    } catch (error) {
      messageDiv.textContent = "Failed to sign up. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  fetchActivities();
});
