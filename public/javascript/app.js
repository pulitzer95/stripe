// Replace with your publishable key
// https://dashboard.stripe.com/apikeys
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51HZXTuJSCgfcRAOa7PzA6kM0jdUHZQ3WNm5OGsvAr0y6HQG4ZdSqwtLJNzcW1O5svtX1t0FzfLkOEEmVHvOCD6of00e8A9VyqK';

// Replace with your tax ids
// https://dashboard.stripe.com/tax-rates
const taxRates = [' '];

// Replace with your Firebase project config.
const firebaseConfig = {
  apiKey: "AIzaSyCPAMkyYfZ8gpgGcLRdauHzS4nYdUtqFzo",
    authDomain: "stripe-9003e.firebaseapp.com",
    databaseURL: "https://stripe-9003e.firebaseio.com",
    projectId: "stripe-9003e",
    storageBucket: "stripe-9003e.appspot.com",
    messagingSenderId: "416030871052",
    appId: "1:416030871052:web:b92c55d3414ac70eea6829",
    measurementId: "G-WHN9VGSEZX"
};

// Replace with your cloud functions location
const functionLocation = 'us-central';

// Initialize Firebase
const firebaseApp = firebase.initializeApp(firebaseConfig);
const db = firebaseApp.firestore();

/**
 * Firebase Authentication configuration
 */
const firebaseUI = new firebaseui.auth.AuthUI(firebase.auth());
const firebaseUiConfig = {
  callbacks: {
    signInSuccessWithAuthResult: function (authResult, redirectUrl) {
      // User successfully signed in.
      // Return type determines whether we continue the redirect automatically
      // or whether we leave that to developer to handle.
      return true;
    },
    uiShown: () => {
      document.querySelector('#loader').style.display = 'none';
    },
  },
  signInFlow: 'popup',
  signInSuccessUrl: '/',
  signInOptions: [
    firebase.auth.GoogleAuthProvider.PROVIDER_ID,
    firebase.auth.EmailAuthProvider.PROVIDER_ID,
  ],
  credentialHelper: firebaseui.auth.CredentialHelper.NONE,
  // Your terms of service url.
  tosUrl: 'https://rixylemarketing.com/terms',
  // Your privacy policy url.
  privacyPolicyUrl: 'https://rixylemarketing.com/privacy',
};
firebase.auth().onAuthStateChanged((firebaseUser) => {
  if (firebaseUser) {
    document.querySelector('#loader').style.display = 'none';
    document.querySelector('main').style.display = 'block';
    currentUser = firebaseUser.uid;
    startDataListeners();
  } else {
    document.querySelector('main').style.display = 'none';
    firebaseUI.start('#firebaseui-auth-container', firebaseUiConfig);
  }
});

/**
 * Data listeners
 */
function startDataListeners() {
  // Get all our products and render them to the page
  const products = document.querySelector('.products');
  const template = document.querySelector('#product');
  db.collection('products')
    .where('active', '==', true)
    .get()
    .then(function (querySnapshot) {
      querySnapshot.forEach(async function (doc) {
        const priceSnap = await doc.ref
          .collection('prices')
          .orderBy('unit_amount')
          .get();
        if (!'content' in document.createElement('template')) {
          console.error('Your browser doesn’t support HTML template elements.');
          return;
        }

        const product = doc.data();
        const container = template.content.cloneNode(true);

        container.querySelector('h2').innerText = product.name.toUpperCase();
        container.querySelector('.description').innerText =
          product.description.toUpperCase() || '';
        // Prices dropdown
        priceSnap.docs.forEach((doc) => {
          const priceId = doc.id;
          const priceData = doc.data();
          const content = document.createTextNode(
            `${new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: priceData.currency,
            }).format((priceData.unit_amount / 100).toFixed(2))} per ${
              priceData.interval
            }`
          );
          const option = document.createElement('option');
          option.value = priceId;
          option.appendChild(content);
          container.querySelector('#price').appendChild(option);
        });

        if (product.images.length) {
          const img = container.querySelector('img');
          img.src = product.images[0];
          img.alt = product.name;
        }

        const form = container.querySelector('form');
        form.addEventListener('submit', subscribe);

        products.appendChild(container);
      });
    });
  // Get all subscriptions for the customer
  db.collection('customers')
    .doc(currentUser)
    .collection('subscriptions')
    .where('status', 'in', ['trialing', 'active'])
    .onSnapshot(async (snapshot) => {
      if (snapshot.empty) {
        // Show products
        document.querySelector('#subscribe').style.display = 'block';
        return;
      }
      document.querySelector('#subscribe').style.display = 'none';
      document.querySelector('#my-subscription').style.display = 'block';
      // In this implementation we only expect one Subscription to exist
      const subscription = snapshot.docs[0].data();
      const priceData = (await subscription.price.get()).data();
      document.querySelector(
        '#my-subscription p'
      ).textContent = `You are paying ${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: priceData.currency,
      }).format((priceData.unit_amount / 100).toFixed(2))} per ${
        priceData.interval
      }, giving you the role: ${await getCustomClaimRole()}. 🥳`;
    });
}

/**
 * Event listeners
 */

// Signout button
document
  .getElementById('signout')
  .addEventListener('click', () => firebase.auth().signOut());

// Checkout handler
async function subscribe(event) {
  event.preventDefault();
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  const formData = new FormData(event.target);

  const docRef = await db
    .collection('customers')
    .doc(currentUser)
    .collection('checkout_sessions')
    .add({
      price: formData.get('price'),
      allow_promotion_codes: true,
      tax_rates: taxRates,
      success_url: window.location.origin,
      cancel_url: window.location.origin,
      metadata: {
        tax_rate: '10% sales tax exclusive',
      },
    });
  // Wait for the CheckoutSession to get attached by the extension
  docRef.onSnapshot((snap) => {
    const { error, sessionId } = snap.data();
    if (error) {
      // Show an error to your customer and then inspect your function logs.
      alert(`An error occured: ${error.message}`);
      document.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
    if (sessionId) {
      // We have a session, let's redirect to Checkout
      // Init Stripe
      const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
      stripe.redirectToCheckout({ sessionId });
    }
  });
}

// Billing portal handler
document
  .querySelector('#billing-portal-button')
  .addEventListener('click', async (event) => {
    document.querySelectorAll('button').forEach((b) => (b.disabled = true));

    // Call billing portal function
    const functionRef = firebase
      .app()
      .functions(functionLocation)
      .httpsCallable('ext-firestore-stripe-subscriptions-createPortalLink');
    const { data } = await functionRef({ returnUrl: window.location.origin });
    window.location.assign(data.url);
  });

// Get custom claim role helper
async function getCustomClaimRole() {
  await firebase.auth().currentUser.getIdToken(true);
  const decodedToken = await firebase.auth().currentUser.getIdTokenResult();
  return decodedToken.claims.stripeRole;
}
