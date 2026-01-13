export interface Article {
  slug: string;
  category: 'estate-planning-articles' | 'business-planning-articles';
  title: string;
  excerpt: string;
  content: string;
}

export const articles: Article[] = [
  // ESTATE PLANNING ARTICLES
  {
    slug: 'what-is-estate-planning',
    category: 'estate-planning-articles',
    title: 'What is Estate Planning?',
    excerpt: "Estate planning is the process of arranging for the management and disposal of a person's estate during their life and after death.",
    content: `
      <p>Remember the joke about the man who asked to be buried with all his money, so his wife deposited all his money in her own bank account and then buried him with a check? This guy needed a better estate plan. So what is estate planning? It's planning for the control and distribution of the assets of a deceased person - because you can't take it with you when you die!</p>

      <p>However, estate planning isn't just about what happens when we die. It's also very much about planning for the here and now to make sure we stay in control, don't run out of money, and don't become a burden on anyone if we become incapacitated, whether temporarily or permanently.</p>

      <p>Fortunately, the good news is that estate planning is both easy and affordable. The hardest part is just showing up!</p>

      <h2>Understanding Estate Planning in Louisiana</h2>
      <p>What is estate planning? Estate planning deals with managing and distributing an individual's assets during life and after death. However, it isn't only about managing one's finances and properties; there's a lot more to it. Some goals of estate planning might include:</p>

      <ul>
        <li>Establishing Durable Powers of Attorney for financial and medical decisions during life so you stay in control</li>
        <li>Executing a Healthcare Directive (also known as a "Living Will") to govern end-of-life decisions</li>
        <li>Creating a Will or Living Trust to determine who is in control and who gets to benefit from assets at death</li>
        <li>Minimizing inheritance and income taxes</li>
        <li>Appointing an executor or trustee to oversee the administration of the estate</li>
        <li>Updating the terms and conditions of insurance policies, annuities, and retirement plans</li>
        <li>Establishing a guardian or tutor for living dependents</li>
      </ul>

      <h2>How Much Does Estate Planning Cost?</h2>
      <p>Estate planning costs vary widely depending on the complexity of the estate and the method of preparation of your estate plan. Attorney-prepared documents are generally more expensive than online estate planning with GeauxPlans.</p>

      <h2>What is Estate Planning and Why Do You Need It?</h2>
      <p>When it comes to estate planning, you have two options: 1. Do Something, or 2. Do Nothing. If you want to make your own decisions about who should control your assets, who gets to benefit, and when, then you must do "something" and not "nothing." If you do nothing, you are opting for the "government's estate plan" where the government will determine who is in control of you and your assets, who gets to benefit, and when.</p>

      <h3>Designate Beneficiaries</h3>
      <p>Everyone has an estate that needs to be distributed after death. This disposition of these assets is not always governed by a Last Will and Testament or Living Trust. Some assets are governed by beneficiary designation, like life insurance, annuities, and retirement plans. These assets are often referred to as "non-probate assets."</p>

      <h3>Intestate Laws (the Government's Estate Plan)</h3>
      <p>Procrastination is the silent killer of estate plans. If you die without a will, your estate will be subjected to the intestate rules. It means that the State of Louisiana (or your state of domicile) will decide who is in control of your estate, who gets to benefit, and when.</p>

      <p>Louisiana intestate laws are rigid and unfavorable. Some of the general default rules are as follows:</p>
      <ul>
        <li>Separate property (possibly the marital home) completely bypasses a surviving spouse</li>
        <li>A surviving spouse does not have full control over community property</li>
        <li>A spouse cannot sell property without the consent of children</li>
        <li>A court will select an executor and determine who controls the estate</li>
        <li>Forced heirship claims are possible in Louisiana</li>
      </ul>

      <h3>Planning for Incapacity</h3>
      <p>Estate planning also allows you to determine who is in control of you and your assets in the event of your incapacity. Incapacity is simply a mental or physical condition that prevents you from acting on your own behalf, whether temporarily or permanently, such as an injury, illness, or degenerative disease.</p>

      <h2>Steps to Prepare Your Estate Plan</h2>
      <ol>
        <li><strong>Identify Assets</strong> - Start by identifying your key assets, including cars, properties, cash, personal possessions, life insurance accounts, etc.</li>
        <li><strong>Advance Healthcare Directive</strong> - Execute an Advance Healthcare Directive (also known as a "Living Will") to govern end-of-life decisions.</li>
        <li><strong>Durable Powers of Attorney</strong> - Execute a Durable Financial Power of Attorney and a Durable Medical Power of Attorney.</li>
        <li><strong>Last Will and Testament or Living Trust</strong> - You need a device to govern the disposition of assets at death.</li>
        <li><strong>Review Beneficiaries</strong> - Update the designated beneficiaries of your non-probate assets.</li>
        <li><strong>Consider Estate Taxes</strong> - Although Federal estate tax may be imposed on larger estates, Louisiana doesn't impose any state-specific tax on the estate.</li>
        <li><strong>Get Help</strong> - You can prepare your own estate plan online with GeauxPlans, which is Louisiana-specific.</li>
      </ol>

      <h2>Takeaway</h2>
      <p>Estate Planning is simply making decisions now, while you can and before you can't - because that day is going to come! Failing to plan is planning to fail. GeauxPlans is an easy and affordable solution that is tailor-made for Louisiana.</p>
    `
  },
  {
    slug: 'what-is-a-will',
    category: 'estate-planning-articles',
    title: 'What Is A Will?',
    excerpt: "A Last Will and Testament is an essential part of any estate plan, yet so many people never get around to creating one.",
    content: `
      <p>What is a Will? It's a very common question. A Last Will and Testament is an essential part of any estate plan, yet so many people never get around to creating a Will for themselves and their family, which is where the trouble starts. Avoidance is natural. Most of us don't really want to reckon with our own mortality. But procrastination is the silent killer of estate plans.</p>

      <p>The mission of GeauxPlans is to make your estate planning journey easy and affordable, so you can rest easy knowing you and your loved ones will be safe and secure should something happen to you.</p>

      <h2>What is a Will?</h2>
      <p>It's pretty simple. A Last Will and Testament is just a gift that takes effect when we die. That's it. In order to be legally valid, a Will must be written in a certain form required by state law. Also, the Will must be signed a certain way. If the formalities of signing a Will are not observed, the Will is legally invalid.</p>

      <h2>Kinds of Wills</h2>

      <h3>Simple Will</h3>
      <p>A Simple Will is sometimes called a "sweetheart will" and just a Will that leaves assets to loved ones outright free of trust. A Simple Will might leave all assets to a spouse with the caveat that if there is no surviving spouse that assets are to be distributed to children or any other person.</p>

      <h3>Testamentary Trust Will</h3>
      <p>A Will can establish a Testamentary Trust for a beneficiary. Instead of leaving assets outright to a beneficiary, a Testamentary Trust Will can establish a protective trust for the beneficiary.</p>

      <h3>Notarial Will</h3>
      <p>A Notarial Will requires a certain form and must be executed in the presence of a notary and two witnesses. A Notarial Will must be signed on the bottom of each page and at the end.</p>

      <h3>Olographic Will / Holographic Will</h3>
      <p>An Olographic Will (sometimes referred to as a Holographic Will) is a handwritten will that must be entirely in the handwriting of the Testator, dated and signed at the end. Handwritten wills sometimes go missing, and are prone to dispute.</p>

      <h3>Online Will</h3>
      <p>An Online Will is just a Will that you create online. Figuring out what to include in a Will can be confusing and you may be unsure of where to start. That's where GeauxPlans shines. Just answer a few questions and we'll take care of the rest.</p>

      <h2>Contents of a Will</h2>
      <p>A Will is one of the most important legal documents that you can have in your estate plan. The purpose of a will is to officially describe your preferences, values and needs regarding how your estate will be managed, secured, and distributed to your loved ones after your death.</p>

      <h2>What a Will Does</h2>
      <p>A Will ensures that your assets are distributed to your heirs and any other organizations that you may wish to include in your estate plan. A Will ensures a surviving spouse will remain in control of assets for the rest of their days and enjoy peaceful possession.</p>

      <p>A Will can:</p>
      <ul>
        <li>Create a testamentary trust for younger beneficiaries</li>
        <li>Appoint trustees to hold, administer and distribute assets</li>
        <li>Nominate guardians or tutors for minor children</li>
        <li>Appoint an Administrator or Executor to control the administration of your estate</li>
      </ul>

      <h2>Consequences If You Don't Have a Will</h2>
      <p>Without a Will, you are under the Government's Estate Plan. The Government decides who is in control of your assets, who gets to benefit, and when. Your estate may not be handled in a manner that aligns with your specific needs, values or wishes.</p>

      <h2>Last Will vs. Living Will</h2>
      <p>Many people confuse a Last Will and Testament with a Living Will (also referred to as an Advance Healthcare Directive). A Will contains information about the distribution of your estate, your named executor, as well as any beneficiaries and guardians or tutors that you want to designate. A Living Will focuses on your medical needs while you are alive, specifically end-of-life decisions.</p>
    `
  },
  {
    slug: 'what-is-a-trust',
    category: 'estate-planning-articles',
    title: 'What Is A Trust?',
    excerpt: "Many building an estate plan wonder what a trust is and whether a trust is right for them.",
    content: `
      <p>What is a trust? Many building an estate plan wonder the same thing and whether a trust is right for them. You can create your own trust online with GeauxPlans, but you need to understand the basics about trusts in order to make informed decisions.</p>

      <h2>What is a Trust?</h2>
      <p>Here's the short answer: A trust is basically an agreement or a contract that is governed by a Trust Code. Once the trust is signed, assets are placed into trust. The process of placing assets into trust is referred to as "funding" a trust. Once the trust is funded, assets are held and administered by a Trustee for the benefit of Beneficiaries.</p>

      <p>The person who creates a trust is referred to as a "Settlor" or "Grantor". The person who manages a trust is referred to as a "Trustee." "Beneficiaries" are entitled to benefits of the trust. The same person can be a Settlor, Trustee, and Beneficiary.</p>

      <h2>Benefits of a Trust</h2>
      <p>A trust can provide a strong layer of protection for beneficiaries and may even help to lower your estate taxes. They offer a number of benefits to anyone regardless of income, such as:</p>
      <ul>
        <li>Avoiding the cost and burden of probate</li>
        <li>Improved control over assets during life</li>
        <li>Asset protection for beneficiaries</li>
        <li>Privacy and relative anonymity</li>
        <li>Minimizing potential disputes</li>
        <li>Maintaining control</li>
        <li>Providing for the orderly administration of your affairs</li>
      </ul>

      <h2>Setting Up A Trust</h2>
      <p>Establishing a trust is a great way to secure your assets and keep them away from the wrong hands. You decide if you want to put all of your assets or some of your assets into a trust.</p>

      <h2>Kinds of Trusts</h2>

      <h3>Testamentary Trust</h3>
      <p>A Testamentary Trust is established in a Will and only takes effect after death. It's used to protect assets for beneficiaries who may not be ready to manage assets on their own.</p>

      <h3>Revocable Living Trust</h3>
      <p>A Revocable Living Trust is established during life and can be amended or revoked at any time. This is the most common type of trust for estate planning purposes and helps avoid probate.</p>

      <h3>Irrevocable Trust</h3>
      <p>An Irrevocable Trust cannot be easily amended or revoked once established. These trusts offer stronger asset protection and may provide tax benefits.</p>

      <h2>Will vs. Trust</h2>
      <p>Both a Will and a Trust can be used to distribute assets at death. The main difference is that a Trust avoids probate while a Will must go through probate. A Trust also provides more privacy since it's not a public record.</p>

      <h2>How Much Does a Trust Cost?</h2>
      <p>The cost of a trust varies depending on whether you use an attorney or an online service like GeauxPlans. Attorney-prepared trusts can cost $1,500 to $5,000 or more. GeauxPlans offers affordable trust-based estate plans starting at $399.</p>
    `
  },
  {
    slug: 'how-much-does-a-will-cost',
    category: 'estate-planning-articles',
    title: 'How Much Does a Will Cost?',
    excerpt: "If you are thinking of making a Will, you are probably wondering how much it costs. The fact is that the price varies widely.",
    content: `
      <h2>How much does a Will cost?</h2>
      <p>If you are thinking of making a Will, you are probably wondering how much does a Will cost. The fact is that the price of a Will varies widely. But making a Will doesn't have to be expensive, and there are affordable options available to many people.</p>

      <h2>How much does a Will kit cost?</h2>
      <p>A Will kit is a do-it-yourself option that provides forms and instructions for creating a Will. Will kits typically cost between $20 and $100. However, Will kits are generic and may not be appropriate for Louisiana, which has unique legal requirements.</p>

      <h2>How much does a lawyer charge for making a Will?</h2>
      <p>Attorney fees for preparing a Will vary widely depending on:</p>
      <ul>
        <li>Geographic location</li>
        <li>Complexity of the estate</li>
        <li>Attorney's experience level</li>
        <li>Whether it's a simple Will or includes trusts</li>
      </ul>
      <p>On average, a simple Will prepared by an attorney costs between $300 and $1,000. More complex Wills with testamentary trusts can cost $1,500 to $3,000 or more.</p>

      <h2>How much does it cost to make an Online Will?</h2>
      <p>Online Will services like GeauxPlans offer a middle ground between DIY kits and attorney-prepared documents. These services typically cost between $100 and $500 for a complete Will-based estate plan.</p>

      <p><strong>GeauxPlans offers Will-based estate plans starting at $199</strong>, which includes:</p>
      <ul>
        <li>Last Will and Testament</li>
        <li>Financial Power of Attorney</li>
        <li>Medical Power of Attorney</li>
        <li>Advance Healthcare Directive (Living Will)</li>
      </ul>

      <h2>Why GeauxPlans?</h2>
      <p>Unlike generic online services, GeauxPlans is specifically designed for Louisiana residents. Louisiana has unique legal requirements (the Napoleonic Code) that other services may not address properly. GeauxPlans ensures your documents are valid under Louisiana law.</p>

      <h2>Is it worth paying for a Will?</h2>
      <p>Absolutely. The cost of not having a Will can be much higher:</p>
      <ul>
        <li>Court costs for intestate proceedings</li>
        <li>Attorney fees for probate</li>
        <li>Family disputes and litigation</li>
        <li>Assets going to unintended recipients</li>
        <li>Minor children without designated guardians</li>
      </ul>
      <p>Investing in a proper Will is one of the best ways to protect your family and ensure your wishes are carried out.</p>
    `
  },
  {
    slug: 'how-much-does-a-trust-cost',
    category: 'estate-planning-articles',
    title: 'How Much Does a Trust Cost?',
    excerpt: "Understanding the costs involved in creating a revocable living trust in Louisiana.",
    content: `
      <h2>How Much Does a Trust Cost?</h2>
      <p>If you're considering a trust as part of your estate plan, you're probably wondering about the cost. Like Wills, trust costs vary widely depending on how you create them and the complexity of your estate.</p>

      <h2>Attorney Fees for Trusts</h2>
      <p>Attorney-prepared trusts are typically more expensive than Wills because they involve more complex documents and planning. Average costs include:</p>
      <ul>
        <li><strong>Simple Revocable Living Trust:</strong> $1,500 - $3,000</li>
        <li><strong>Complex Trust with special provisions:</strong> $3,000 - $5,000+</li>
        <li><strong>Irrevocable Trusts:</strong> $3,000 - $10,000+</li>
      </ul>

      <h2>Online Trust Services</h2>
      <p>Online services offer more affordable options for creating trusts. However, many online services are not Louisiana-specific, which can create problems since Louisiana has unique legal requirements.</p>

      <h2>GeauxPlans Trust-Based Estate Plan</h2>
      <p><strong>GeauxPlans offers Trust-based estate plans starting at $399</strong>, which includes:</p>
      <ul>
        <li>Revocable Living Trust</li>
        <li>Pour-Over Will</li>
        <li>Financial Power of Attorney</li>
        <li>Medical Power of Attorney</li>
        <li>Advance Healthcare Directive</li>
        <li>Certificate of Trust</li>
      </ul>

      <h2>Is a Trust Worth the Cost?</h2>
      <p>A trust may be worth the additional cost if you want to:</p>
      <ul>
        <li>Avoid the probate process entirely</li>
        <li>Keep your estate private (trusts don't become public record)</li>
        <li>Maintain control over how assets are distributed over time</li>
        <li>Protect beneficiaries from themselves or creditors</li>
        <li>Plan for potential incapacity</li>
      </ul>

      <h2>Trust vs. Will: Which is Right for You?</h2>
      <p>The decision between a Will and a Trust depends on your specific circumstances. Take the GeauxPlans quiz to find out which option is best for your situation.</p>
    `
  },
  {
    slug: 'power-of-attorney-louisiana',
    category: 'estate-planning-articles',
    title: 'Power of Attorney in Louisiana',
    excerpt: "Understanding power of attorney documents and their importance in Louisiana estate planning.",
    content: `
      <h2>What is a Power of Attorney?</h2>
      <p>A Power of Attorney is a legal document that allows you to appoint someone (called an "agent" or "mandatary" in Louisiana) to act on your behalf in financial or medical matters. In Louisiana, powers of attorney are governed by the Louisiana Uniform Power of Attorney Act.</p>

      <h2>Types of Power of Attorney in Louisiana</h2>

      <h3>Financial Power of Attorney (Procuration)</h3>
      <p>A Financial Power of Attorney allows your agent to handle financial matters on your behalf, such as:</p>
      <ul>
        <li>Banking transactions</li>
        <li>Real estate transactions</li>
        <li>Tax matters</li>
        <li>Business operations</li>
        <li>Investment decisions</li>
      </ul>

      <h3>Medical Power of Attorney (Healthcare Proxy)</h3>
      <p>A Medical Power of Attorney allows your agent to make healthcare decisions on your behalf if you become incapacitated, including:</p>
      <ul>
        <li>Choosing doctors and healthcare providers</li>
        <li>Deciding on treatments and procedures</li>
        <li>Accessing medical records</li>
        <li>Making end-of-life decisions (if specified)</li>
      </ul>

      <h2>Durable vs. Non-Durable Power of Attorney</h2>
      <p>A "durable" power of attorney remains in effect even if you become incapacitated. This is crucial for estate planning purposes. A non-durable power of attorney terminates upon incapacity.</p>

      <h2>Why You Need a Power of Attorney</h2>
      <p>Without a power of attorney, if you become incapacitated, your family would need to go through an expensive court process called "interdiction" to gain authority over your affairs. This can cost thousands of dollars and take months to complete.</p>

      <h2>Louisiana-Specific Requirements</h2>
      <p>Louisiana has specific requirements for powers of attorney:</p>
      <ul>
        <li>Must be in writing</li>
        <li>Must be signed by the principal</li>
        <li>Should be notarized for broader acceptance</li>
        <li>Some powers require specific language to be effective</li>
      </ul>

      <h2>GeauxPlans Power of Attorney Plan</h2>
      <p>GeauxPlans offers a Power of Attorney Plan starting at $99 that includes both Financial and Medical Powers of Attorney designed specifically for Louisiana residents.</p>
    `
  },
  {
    slug: 'power-of-attorney-durable',
    category: 'estate-planning-articles',
    title: 'Durable Power of Attorney',
    excerpt: "What makes a power of attorney 'durable' and why it matters for your planning.",
    content: `
      <h2>What is a Durable Power of Attorney?</h2>
      <p>A Durable Power of Attorney is a legal document that remains in effect even if you become mentally incapacitated. The word "durable" means the document survives your incapacity, unlike a regular power of attorney which terminates when you can no longer make decisions for yourself.</p>

      <h2>Why "Durable" Matters</h2>
      <p>The whole point of having a power of attorney for estate planning purposes is to ensure someone can act on your behalf if you can't act for yourself. Without the "durable" provision, the power of attorney would terminate at the exact moment you need it most - when you become incapacitated.</p>

      <h2>When Does a Durable POA Take Effect?</h2>
      <p>A durable power of attorney can be:</p>
      <ul>
        <li><strong>Immediate:</strong> Takes effect as soon as it's signed</li>
        <li><strong>Springing:</strong> Only takes effect upon a triggering event, usually incapacity</li>
      </ul>
      <p>Most estate planning attorneys recommend immediate powers of attorney because proving incapacity to trigger a springing power can be complicated and time-consuming.</p>

      <h2>What Powers Can Be Granted?</h2>
      <p>A durable power of attorney can grant broad or limited powers, including:</p>
      <ul>
        <li>Managing bank accounts and investments</li>
        <li>Buying, selling, or managing real estate</li>
        <li>Filing tax returns</li>
        <li>Managing business interests</li>
        <li>Making gifts on your behalf</li>
        <li>Applying for government benefits</li>
      </ul>

      <h2>Choosing Your Agent</h2>
      <p>Choosing the right agent is crucial. Your agent should be:</p>
      <ul>
        <li>Trustworthy and honest</li>
        <li>Financially responsible</li>
        <li>Willing and able to serve</li>
        <li>Available when needed</li>
        <li>Understanding of your wishes</li>
      </ul>

      <h2>Revoking a Durable POA</h2>
      <p>As long as you have mental capacity, you can revoke a durable power of attorney at any time. You should notify your agent and any institutions that have copies of the document.</p>
    `
  },
  {
    slug: 'power-of-attorney-limited',
    category: 'estate-planning-articles',
    title: 'Limited Power of Attorney',
    excerpt: "When and why you might use a limited power of attorney in Louisiana.",
    content: `
      <h2>What is a Limited Power of Attorney?</h2>
      <p>A Limited Power of Attorney (also called a Special Power of Attorney) grants your agent authority to act on your behalf only for specific purposes or for a limited time period. Unlike a general power of attorney, which grants broad authority, a limited POA restricts your agent's powers to only what you specify.</p>

      <h2>Common Uses for Limited POA</h2>
      <ul>
        <li><strong>Real Estate Transactions:</strong> Authorizing someone to sign closing documents on your behalf</li>
        <li><strong>Vehicle Sales:</strong> Allowing someone to sell or register a vehicle for you</li>
        <li><strong>Banking:</strong> Authorizing specific account transactions</li>
        <li><strong>Business Matters:</strong> Signing contracts or documents for a specific deal</li>
        <li><strong>Legal Matters:</strong> Representing you in a specific legal proceeding</li>
      </ul>

      <h2>Limited vs. General Power of Attorney</h2>
      <table>
        <tr>
          <th>Limited POA</th>
          <th>General POA</th>
        </tr>
        <tr>
          <td>Specific powers only</td>
          <td>Broad authority</td>
        </tr>
        <tr>
          <td>Often time-limited</td>
          <td>Usually ongoing</td>
        </tr>
        <tr>
          <td>Single transaction focus</td>
          <td>Multiple matters</td>
        </tr>
        <tr>
          <td>Lower risk of abuse</td>
          <td>Higher risk if agent is untrustworthy</td>
        </tr>
      </table>

      <h2>When to Use a Limited POA</h2>
      <p>A limited power of attorney is appropriate when:</p>
      <ul>
        <li>You need someone to handle a specific task while you're unavailable</li>
        <li>You're uncomfortable giving broad authority</li>
        <li>The matter is temporary or one-time</li>
        <li>You want to maintain control over most of your affairs</li>
      </ul>

      <h2>Louisiana Requirements</h2>
      <p>In Louisiana, a limited power of attorney should:</p>
      <ul>
        <li>Clearly specify the powers granted</li>
        <li>Include any time limitations</li>
        <li>Be notarized for real estate transactions</li>
        <li>Be signed by the principal</li>
      </ul>
    `
  },
  {
    slug: 'estate-planning-mistakes',
    category: 'estate-planning-articles',
    title: '10 Estate Planning Mistakes and How to Avoid Them',
    excerpt: "Common errors that can derail your estate plan and how to avoid them.",
    content: `
      <h2>10 Estate Planning Mistakes to Avoid</h2>
      <p>Estate planning mistakes can be costly for your family. Here are the most common mistakes and how to avoid them:</p>

      <h3>Mistake #1: Not Having an Estate Plan at All</h3>
      <p>The biggest mistake is not having an estate plan. Without one, the state decides who gets your assets and who cares for your children. Don't let procrastination cost your family.</p>

      <h3>Mistake #2: Not Updating Your Plan</h3>
      <p>Life changes - marriages, divorces, births, deaths, and financial changes all affect your estate plan. Review your plan every 3-5 years or after major life events.</p>

      <h3>Mistake #3: Forgetting to Fund Your Trust</h3>
      <p>Creating a trust without transferring assets into it is like building a house without moving in. An unfunded trust won't avoid probate.</p>

      <h3>Mistake #4: Not Coordinating Beneficiary Designations</h3>
      <p>Beneficiary designations on life insurance, retirement accounts, and bank accounts override your Will. Make sure they align with your overall plan.</p>

      <h3>Mistake #5: Choosing the Wrong Executor or Trustee</h3>
      <p>Your executor or trustee should be trustworthy, organized, and capable of handling financial matters. Consider naming a professional if family members aren't suitable.</p>

      <h3>Mistake #6: Not Planning for Incapacity</h3>
      <p>Estate planning isn't just about death. Without powers of attorney, your family may need to go to court to manage your affairs if you become incapacitated.</p>

      <h3>Mistake #7: Not Providing for Minor Children</h3>
      <p>If you have minor children, your Will should name a guardian (tutor in Louisiana). Without this, the court decides who raises your children.</p>

      <h3>Mistake #8: Leaving Assets Outright to Irresponsible Beneficiaries</h3>
      <p>Consider using trusts to protect beneficiaries who are young, have special needs, or have creditor issues.</p>

      <h3>Mistake #9: DIY Estate Planning with Generic Forms</h3>
      <p>Louisiana has unique legal requirements. Generic forms from other states may not be valid here. Use Louisiana-specific documents.</p>

      <h3>Mistake #10: Not Telling Anyone About Your Plan</h3>
      <p>Your family should know where your documents are and who your executor/trustee is. Consider sharing your wishes with loved ones.</p>
    `
  },
  {
    slug: 'make-a-will-online',
    category: 'estate-planning-articles',
    title: 'Make a Will Online',
    excerpt: "How to create a valid Louisiana will online with GeauxPlans.",
    content: `
      <h2>Can You Make a Will Online?</h2>
      <p>Yes, you can create a legally valid Will online. Online Will services have made estate planning accessible and affordable for everyone. However, not all online services are created equal, especially for Louisiana residents.</p>

      <h2>Why Louisiana is Different</h2>
      <p>Louisiana's legal system is based on the Napoleonic Code, which differs significantly from the common law system used in other states. This means:</p>
      <ul>
        <li>Louisiana has specific Will formalities that must be followed</li>
        <li>Forced heirship rules may apply to your estate</li>
        <li>Community property laws affect how assets are distributed</li>
        <li>Terminology differs (executor vs. succession representative, guardian vs. tutor)</li>
      </ul>

      <h2>Problems with Generic Online Wills</h2>
      <p>Many online Will services use one-size-fits-all templates that may not comply with Louisiana law:</p>
      <ul>
        <li>May not meet Louisiana's signing requirements</li>
        <li>May use incorrect legal terminology</li>
        <li>May not address forced heirship</li>
        <li>May not be recognized by Louisiana courts</li>
      </ul>

      <h2>Why Choose GeauxPlans?</h2>
      <p>GeauxPlans is the only online estate planning service designed exclusively for Louisiana:</p>
      <ul>
        <li>Documents are Louisiana-specific and legally valid</li>
        <li>Created by Louisiana attorneys</li>
        <li>Addresses forced heirship and community property</li>
        <li>Uses correct Louisiana terminology</li>
        <li>Includes guidance for proper execution</li>
      </ul>

      <h2>How GeauxPlans Works</h2>
      <ol>
        <li>Choose your plan</li>
        <li>Answer simple questions about your situation</li>
        <li>Review your customized documents</li>
        <li>Download and sign according to instructions</li>
      </ol>

      <h2>What's Included?</h2>
      <p>GeauxPlans Will-based estate plans include:</p>
      <ul>
        <li>Last Will and Testament</li>
        <li>Financial Power of Attorney</li>
        <li>Medical Power of Attorney</li>
        <li>Advance Healthcare Directive</li>
        <li>Detailed signing instructions</li>
      </ul>
    `
  },
  {
    slug: 'online-estate-planning-in-louisiana',
    category: 'estate-planning-articles',
    title: 'The Best Solution for Online Estate Planning in Louisiana',
    excerpt: "GeauxPlans is a 100% safe source for online estate planning forms in Louisiana, backed by licensed Louisiana attorneys.",
    content: `
      <h2>Online Estate Planning in Louisiana</h2>
      <p>Online estate planning has revolutionized how people create Wills, Trusts, and other important documents. But for Louisiana residents, finding an online service that actually works can be challenging.</p>

      <h2>The Louisiana Problem</h2>
      <p>Most online estate planning services are designed for common law states. Louisiana is different:</p>
      <ul>
        <li>Based on the Napoleonic Code, not common law</li>
        <li>Unique forced heirship rules</li>
        <li>Community property state</li>
        <li>Different terminology and requirements</li>
      </ul>
      <p>Using a generic online service could result in documents that aren't valid in Louisiana.</p>

      <h2>Why GeauxPlans is the Solution</h2>
      <p>GeauxPlans was created specifically for Louisiana residents by Louisiana attorneys. Our documents are:</p>
      <ul>
        <li>100% Louisiana-specific</li>
        <li>Legally valid and enforceable</li>
        <li>Created by licensed Louisiana attorneys</li>
        <li>Updated for current Louisiana law</li>
      </ul>

      <h2>Safe and Secure</h2>
      <p>GeauxPlans takes your security seriously:</p>
      <ul>
        <li>Secure, encrypted connections</li>
        <li>Your information is never sold or shared</li>
        <li>Documents are stored securely</li>
        <li>You control access to your documents</li>
      </ul>

      <h2>Affordable Pricing</h2>
      <p>GeauxPlans offers estate planning at a fraction of attorney fees:</p>
      <ul>
        <li>Power of Attorney Plan: Starting at $99</li>
        <li>Minor Child-Centered Plan: Starting at $199</li>
        <li>Will-Based Estate Plan: Starting at $199</li>
        <li>Trust-Based Estate Plan: Starting at $399</li>
      </ul>

      <h2>Support Available</h2>
      <p>Unlike other online services, GeauxPlans offers real support from real people who understand Louisiana law. Contact us at (855) 213-6300.</p>
    `
  },
  {
    slug: 'essential-estate-planning-documents',
    category: 'estate-planning-articles',
    title: 'Essential Estate Planning Documents',
    excerpt: "Learn about the key documents every Louisiana resident should have in their estate plan.",
    content: `
      <h2>Essential Estate Planning Documents</h2>
      <p>A complete estate plan includes several key documents that work together to protect you during life and ensure your wishes are carried out after death.</p>

      <h2>1. Last Will and Testament</h2>
      <p>A Will is the foundation of most estate plans. It allows you to:</p>
      <ul>
        <li>Designate who receives your assets</li>
        <li>Name an executor to manage your estate</li>
        <li>Appoint a guardian (tutor) for minor children</li>
        <li>Specify burial wishes</li>
      </ul>

      <h2>2. Revocable Living Trust</h2>
      <p>A Trust is an alternative or supplement to a Will that offers additional benefits:</p>
      <ul>
        <li>Avoids probate</li>
        <li>Provides privacy</li>
        <li>Allows for management during incapacity</li>
        <li>Can include detailed distribution instructions</li>
      </ul>

      <h2>3. Financial Power of Attorney</h2>
      <p>This document allows someone to manage your financial affairs if you're unable to:</p>
      <ul>
        <li>Pay bills</li>
        <li>Manage investments</li>
        <li>File taxes</li>
        <li>Handle banking</li>
      </ul>

      <h2>4. Medical Power of Attorney</h2>
      <p>Also called a Healthcare Proxy, this document allows someone to make medical decisions for you if you're incapacitated:</p>
      <ul>
        <li>Choose doctors and hospitals</li>
        <li>Consent to treatments</li>
        <li>Access medical records</li>
        <li>Make healthcare decisions</li>
      </ul>

      <h2>5. Advance Healthcare Directive (Living Will)</h2>
      <p>This document expresses your wishes regarding end-of-life care:</p>
      <ul>
        <li>Life-sustaining treatment preferences</li>
        <li>Pain management wishes</li>
        <li>Organ donation preferences</li>
      </ul>

      <h2>6. HIPAA Authorization</h2>
      <p>This allows designated individuals to access your medical information.</p>

      <h2>Getting Started</h2>
      <p>GeauxPlans estate plans include all the essential documents you need, customized for Louisiana law. Start your plan today!</p>
    `
  },

  // BUSINESS PLANNING ARTICLES
  {
    slug: 'do-i-need-an-llc',
    category: 'business-planning-articles',
    title: 'Do I Need an LLC?',
    excerpt: "Learn whether forming an LLC is right for your business situation and understand the key benefits and requirements.",
    content: `
      <h2>Do I Need an LLC?</h2>
      <p>If you're starting a business or already running one as a sole proprietor, you may be wondering if you need to form an LLC (Limited Liability Company). The answer depends on several factors.</p>

      <h2>What is an LLC?</h2>
      <p>An LLC is a business structure that combines the liability protection of a corporation with the tax flexibility of a partnership or sole proprietorship. It's one of the most popular business structures for small businesses.</p>

      <h2>Benefits of an LLC</h2>

      <h3>1. Personal Liability Protection</h3>
      <p>The primary benefit of an LLC is protecting your personal assets from business debts and lawsuits. Without an LLC, your personal assets (home, savings, vehicles) could be at risk if your business is sued or can't pay its debts.</p>

      <h3>2. Tax Flexibility</h3>
      <p>LLCs can choose how they're taxed:</p>
      <ul>
        <li>As a sole proprietorship (single member)</li>
        <li>As a partnership (multiple members)</li>
        <li>As an S-Corporation or C-Corporation</li>
      </ul>

      <h3>3. Credibility</h3>
      <p>Having "LLC" after your business name can make your business appear more professional and established.</p>

      <h3>4. Flexibility in Management</h3>
      <p>LLCs have fewer formalities than corporations and more flexibility in how they're managed.</p>

      <h2>When You Might Need an LLC</h2>
      <ul>
        <li>Your business has risk of lawsuits or liability</li>
        <li>You have significant personal assets to protect</li>
        <li>You want to separate business and personal finances</li>
        <li>You have business partners</li>
        <li>You want business credibility</li>
      </ul>

      <h2>When You Might Not Need an LLC</h2>
      <ul>
        <li>Very low-risk hobby business</li>
        <li>Minimal assets at risk</li>
        <li>Just testing a business idea</li>
      </ul>

      <h2>Forming an LLC in Louisiana</h2>
      <p>GeauxPlans makes it easy to form an LLC in Louisiana. Our service includes:</p>
      <ul>
        <li>Business name availability check</li>
        <li>Articles of Organization filing</li>
        <li>Operating Agreement</li>
        <li>EIN application assistance</li>
      </ul>
    `
  },
  {
    slug: 'guide-to-starting-a-business',
    category: 'business-planning-articles',
    title: 'Guide to Starting a Business in Louisiana',
    excerpt: "A comprehensive guide covering everything you need to know about starting a business in the Bayou State.",
    content: `
      <h2>Starting a Business in Louisiana</h2>
      <p>Louisiana is a great place to start a business, with its diverse economy, strategic location, and business-friendly environment. Here's your comprehensive guide to getting started.</p>

      <h2>Step 1: Choose Your Business Structure</h2>
      <p>Common business structures include:</p>
      <ul>
        <li><strong>Sole Proprietorship:</strong> Simplest structure, but no liability protection</li>
        <li><strong>LLC:</strong> Liability protection with tax flexibility</li>
        <li><strong>Corporation:</strong> More complex structure with strong liability protection</li>
        <li><strong>Partnership:</strong> For businesses with multiple owners</li>
      </ul>

      <h2>Step 2: Choose a Business Name</h2>
      <p>Your business name must be:</p>
      <ul>
        <li>Unique in Louisiana</li>
        <li>Not misleading or confusing</li>
        <li>Include required designators (LLC, Inc., etc.)</li>
      </ul>
      <p>GeauxPlans can check name availability with the Louisiana Secretary of State.</p>

      <h2>Step 3: Register Your Business</h2>
      <p>For LLCs, you need to:</p>
      <ul>
        <li>File Articles of Organization with the Secretary of State</li>
        <li>Pay the filing fee ($100 for LLCs)</li>
        <li>Designate a registered agent</li>
      </ul>

      <h2>Step 4: Get an EIN</h2>
      <p>An Employer Identification Number (EIN) is required if you:</p>
      <ul>
        <li>Have employees</li>
        <li>Operate as a corporation or partnership</li>
        <li>Want to open a business bank account</li>
      </ul>

      <h2>Step 5: Create an Operating Agreement</h2>
      <p>While not required by Louisiana law, an Operating Agreement is essential for:</p>
      <ul>
        <li>Defining member roles and responsibilities</li>
        <li>Establishing profit distribution</li>
        <li>Setting decision-making procedures</li>
        <li>Protecting your limited liability status</li>
      </ul>

      <h2>Step 6: Obtain Necessary Licenses and Permits</h2>
      <p>Depending on your business type and location, you may need:</p>
      <ul>
        <li>State business license</li>
        <li>Local occupational licenses</li>
        <li>Professional licenses</li>
        <li>Sales tax permit</li>
      </ul>

      <h2>Step 7: Set Up Business Banking and Accounting</h2>
      <p>Keep business and personal finances separate to maintain liability protection.</p>

      <h2>Get Started with GeauxPlans</h2>
      <p>GeauxPlans can help you form your Louisiana LLC quickly and affordably.</p>
    `
  },
  {
    slug: 'llc-provide-asset-protection',
    category: 'business-planning-articles',
    title: 'Does an LLC Provide Asset Protection?',
    excerpt: "Understanding how an LLC can protect your personal assets from business liabilities and creditors.",
    content: `
      <h2>LLC Asset Protection</h2>
      <p>One of the primary reasons business owners form LLCs is for asset protection. But how does this protection actually work?</p>

      <h2>How LLC Protection Works</h2>
      <p>An LLC creates a legal separation between you personally and your business. This separation, often called the "corporate veil," means that:</p>
      <ul>
        <li>Business debts are the LLC's responsibility, not yours personally</li>
        <li>If the business is sued, only business assets are at risk</li>
        <li>Your personal assets (home, savings, personal vehicles) are generally protected</li>
      </ul>

      <h2>What an LLC Protects Against</h2>
      <ul>
        <li>Business debts and loans</li>
        <li>Lawsuits against the business</li>
        <li>Contract disputes</li>
        <li>Product liability claims</li>
        <li>Employee-related claims</li>
      </ul>

      <h2>What an LLC Does NOT Protect Against</h2>
      <ul>
        <li>Personal guarantees you've signed</li>
        <li>Your own negligence or wrongdoing</li>
        <li>Commingling personal and business funds</li>
        <li>Failure to maintain LLC formalities</li>
        <li>Undercapitalization</li>
      </ul>

      <h2>Piercing the Corporate Veil</h2>
      <p>Courts can "pierce the veil" and hold you personally liable if you:</p>
      <ul>
        <li>Mix personal and business finances</li>
        <li>Don't maintain separate LLC records</li>
        <li>Use the LLC to commit fraud</li>
        <li>Fail to adequately capitalize the LLC</li>
        <li>Treat the LLC as a personal piggy bank</li>
      </ul>

      <h2>Maintaining Your Protection</h2>
      <p>To keep your liability protection intact:</p>
      <ul>
        <li>Keep business and personal finances separate</li>
        <li>Have a written Operating Agreement</li>
        <li>Document major decisions</li>
        <li>Maintain adequate business insurance</li>
        <li>Pay yourself a reasonable salary</li>
      </ul>

      <h2>Operating Agreement is Key</h2>
      <p>An Operating Agreement helps demonstrate that your LLC is a legitimate, separate entity. GeauxPlans can help you create a comprehensive Operating Agreement for your Louisiana LLC.</p>
    `
  },
  {
    slug: 'operating-agreement-louisiana-llc',
    category: 'business-planning-articles',
    title: 'The Top 3 Reasons You Need an Operating Agreement for Your Louisiana LLC',
    excerpt: "Without an operating agreement, Louisiana's default LLC rules apply, which have significant limitations.",
    content: `
      <h2>Why You Need an Operating Agreement</h2>
      <p>While Louisiana doesn't legally require LLCs to have an Operating Agreement, having one is crucial for protecting your business and personal assets.</p>

      <h2>Reason #1: Protect Your Limited Liability</h2>
      <p>Without an Operating Agreement, courts may view your LLC as not being a legitimate separate entity. This could result in "piercing the corporate veil," making you personally liable for business debts.</p>
      <p>An Operating Agreement demonstrates that:</p>
      <ul>
        <li>The LLC is a separate legal entity</li>
        <li>Proper formalities are being observed</li>
        <li>The business has established rules and procedures</li>
      </ul>

      <h2>Reason #2: Override Default State Rules</h2>
      <p>Without an Operating Agreement, Louisiana's default LLC rules apply. These defaults may not be what you want:</p>
      <ul>
        <li>Profits split equally regardless of capital contributions</li>
        <li>All members have equal management rights</li>
        <li>Decisions may require unanimous consent</li>
        <li>Limited options for transferring membership interests</li>
      </ul>
      <p>An Operating Agreement lets you customize these rules for your situation.</p>

      <h2>Reason #3: Prevent Disputes</h2>
      <p>An Operating Agreement addresses important questions before they become conflicts:</p>
      <ul>
        <li>How are profits and losses divided?</li>
        <li>Who makes day-to-day decisions?</li>
        <li>What happens if a member wants to leave?</li>
        <li>How are disputes resolved?</li>
        <li>What happens if a member dies or becomes incapacitated?</li>
      </ul>

      <h2>What Should Be Included?</h2>
      <p>A comprehensive Operating Agreement should cover:</p>
      <ul>
        <li>Member information and ownership percentages</li>
        <li>Capital contributions</li>
        <li>Profit and loss allocation</li>
        <li>Management structure</li>
        <li>Voting rights and procedures</li>
        <li>Member meetings</li>
        <li>Transfer restrictions</li>
        <li>Buy-sell provisions</li>
        <li>Dissolution procedures</li>
      </ul>

      <h2>Get Your Operating Agreement</h2>
      <p>GeauxPlans offers comprehensive Operating Agreements designed specifically for Louisiana LLCs, starting at $149.</p>
    `
  },
  {
    slug: 'start-an-llc-in-louisiana',
    category: 'business-planning-articles',
    title: 'Start an LLC in Louisiana',
    excerpt: "Step-by-step instructions for forming your Louisiana Limited Liability Company.",
    content: `
      <h2>How to Start an LLC in Louisiana</h2>
      <p>Starting an LLC in Louisiana is straightforward. Here's a step-by-step guide to get your business up and running.</p>

      <h2>Step 1: Choose Your LLC Name</h2>
      <p>Your LLC name must:</p>
      <ul>
        <li>Include "Limited Liability Company," "LLC," or "L.L.C."</li>
        <li>Be distinguishable from other registered businesses</li>
        <li>Not include restricted words without proper licensing</li>
      </ul>
      <p>Use GeauxPlans to check name availability with the Louisiana Secretary of State.</p>

      <h2>Step 2: Choose a Registered Agent</h2>
      <p>Every Louisiana LLC must have a registered agent who:</p>
      <ul>
        <li>Has a physical address in Louisiana</li>
        <li>Is available during business hours</li>
        <li>Can receive legal documents on behalf of the LLC</li>
      </ul>

      <h2>Step 3: File Articles of Organization</h2>
      <p>File with the Louisiana Secretary of State. Required information includes:</p>
      <ul>
        <li>LLC name</li>
        <li>Principal business address</li>
        <li>Registered agent name and address</li>
        <li>Duration (perpetual or specific term)</li>
        <li>Management structure</li>
      </ul>
      <p>Filing fee: $100</p>

      <h2>Step 4: Create an Operating Agreement</h2>
      <p>While not required, an Operating Agreement is essential for:</p>
      <ul>
        <li>Defining ownership and management</li>
        <li>Protecting limited liability status</li>
        <li>Preventing future disputes</li>
      </ul>

      <h2>Step 5: Obtain an EIN</h2>
      <p>Get a free Employer Identification Number from the IRS. You'll need it for:</p>
      <ul>
        <li>Opening a business bank account</li>
        <li>Filing taxes</li>
        <li>Hiring employees</li>
      </ul>

      <h2>Step 6: File Initial Report</h2>
      <p>Louisiana requires LLCs to file an initial report with the Secretary of State within 60 days of formation, then annually thereafter.</p>

      <h2>Step 7: Obtain Necessary Licenses</h2>
      <p>Depending on your business, you may need:</p>
      <ul>
        <li>State business license</li>
        <li>Local permits</li>
        <li>Professional licenses</li>
        <li>Sales tax permit</li>
      </ul>

      <h2>Start Your LLC with GeauxPlans</h2>
      <p>GeauxPlans handles the paperwork so you can focus on your business. Our LLC formation service includes:</p>
      <ul>
        <li>Name availability search</li>
        <li>Articles of Organization preparation and filing</li>
        <li>Operating Agreement</li>
        <li>EIN application assistance</li>
      </ul>
    `
  }
];

export const getArticleBySlug = (category: string, slug: string): Article | undefined => {
  return articles.find(a => a.category === category && a.slug === slug);
};

export const getArticlesByCategory = (category: string): Article[] => {
  return articles.filter(a => a.category === category);
};
