import React, { useEffect } from 'react';

/**
 * Booking for the Attorney-Guided Design Meeting.
 *
 * This lived at /my-account/interview on the old site. The rewrite kept the
 * page people land on *after* booking (/guided-design-appointment-confirmation)
 * but not the page that books, so the appointment every plan includes had
 * become unreachable from inside the app.
 *
 * OnceHub renders into a div it finds by id, so the embed is reproduced as it
 * was rather than replaced with a link out — a customer who has already paid
 * should not have to leave the account area to claim what they bought.
 */

const ONCEHUB_PAGE = 'GeauxPlans-Guided-Design-Appointment';
const ONCEHUB_SRC = 'https://cdn.oncehub.com/mergedjs/so.js';

const ScheduleAppointment: React.FC = () => {
  useEffect(() => {
    // Appended once and left in place: OnceHub's script scans for its target
    // div on load, and re-adding the tag on every visit stacks duplicate
    // widgets rather than refreshing the one that is already there.
    if (document.querySelector(`script[src="${ONCEHUB_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = ONCEHUB_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Schedule your Attorney-Guided Design Meeting</h2>

      <p style={{ color: '#555', marginBottom: '25px' }}>
        If you haven&rsquo;t done so yet, please schedule your Attorney-Guided Design meeting. We
        highly recommend that you enter all personal information for any person or entity that you
        intend to include in your GeauxPlans Documents before your scheduled Design Meeting, to make
        the most of your 15 minutes of attorney time. Please note your attorney will not render
        legal advice, but will assist you in completing the interview to properly reflect your
        wishes.
      </p>

      <div
        id={`SOIDIV_${ONCEHUB_PAGE}`}
        data-so-page={ONCEHUB_PAGE}
        data-height="550"
        data-style="border: 1px solid #d8d8d8; min-width: 290px; max-width: 900px;"
        data-psz="00"
      ></div>

      {/*
        The widget is third-party and can fail to load — an ad blocker is enough.
        Without this the panel would just be empty, and someone owed an
        appointment would have no way to tell that anything went wrong.
      */}
      <noscript>
        <p style={{ color: '#555' }}>
          Scheduling requires JavaScript. Please call us at +1 (855) 213-6300 to book your Design
          Meeting.
        </p>
      </noscript>

      <p style={{ color: '#707070', fontSize: '14px', marginTop: '25px' }}>
        Not seeing the calendar? Call us at <strong>+1 (855) 213-6300</strong>, Monday to Friday,
        8am&ndash;5pm CST, and we will book it for you.
      </p>
    </div>
  );
};

export default ScheduleAppointment;
