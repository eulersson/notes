---
publish: true
tags:
- pkm
---
## Goals
- Ability to select what gets published and what not.
- Media attachments to get included, and also audio, pdfs.
- Ability to publish within iOS too.
- Tibetan text to be read properly.

## ❌ Option 1: Obsidian Export
https://github.com/zoni/obsidian-export

*How it Works*: A subfolder can be exported with a tool such as [obsidian-export](https://github.com/zoni/obsidian-export) , which also brings with it all the embedded files into a destination. In that case that was my personal's website content folder which can render `.mdx`.

I was doing my own customization to handle `.mdx` and embed the images and audios as I wanted in **eulersson/obsidian-mdx-export**.  I ended up deleting because it would involve a lot of work on designing the components on the personal website side. I would be reinventing the wheel maybe the benefit of some seamlessness with my website but I don't think it's worth. I needed something more off-the-shelf.

## ❌ Option 2: Digital Garden
https://dg-docs.ole.dev/

*How it Works* What is convenient about this method is having the action within Obsidian to publish the note, which by using the GitHub API would send the content to your repository without needing any local machine to do it, it goes through HTTP. Then Vercel would pick up the changes and produce the static website.

It's the first one I tried, it produced what I intended, but compared to [[#Option 3 Quartz]] it felt very basic, quartz gives you more fine-grained detail and deeper customization into the processing steps that take during the content transformation.

I had to write some changes on their code in order to also have it embed audio files. See the *Pull Requests* I offered to [oleeskild/digitalgarden](https://github.com/oleeskild/digitalgarden/pull/306) and [oleeskild/obsidian-digital-garden](https://github.com/oleeskild/obsidian-digital-garden/pull/674).

## ✅ Option 3: Quartz
https://quartz.jzhao.xyz/

*How it Works*: You clone your quartz fork and place the markdown files within the `content/` folder. Then a hook that watches the repository changes (*GitHub*, *Cloudflare*, ...) would detect the commit and run the static page generation (*GitHub Pages*, *Cloudflare Pages*). That means the markdowns ideally should be in the repository but I am using it in a different way because I don't want my entire vault to be in the repository.

> [!success]
> Have a look! https://notes.ramn.dev/

*Perks*: You get the graph of interconnected notes! Also everything is a React component, so you have a lot of freedom to customize the look and feel. Furthermore you can hook into the text transformation very easily and write your own [transformers](https://quartz.jzhao.xyz/advanced/making-plugins#transformers). I wrote my on [Tibetan language processor](https://github.com/eulersson/notes/blob/main/quartz/plugins/transformers/tibetan.ts) which wraps it into `<span>` HTML tags that increase the text size!

The deployment method I used is *Cloudflare Pages* which seems convenient since I have my domain proxied through them anyway. The instructions are in [Quartz Documentation's Hosting on Cloudflare Pages](https://quartz.jzhao.xyz/hosting#cloudflare-pages).

*My First Workflow* (abandoned): I symlink my vault to `content/` and run the static generation locally, commit it and push it. The hook therefore (in my case *Cloudflare*) doesn't need any `node` environment therefore, it only grabs the pages from `public/` and uses that for serving. The ugly part is that *generated HTML* content is kept in the repo instead of the source that generated it. It's not nice to have something that gents rendered or generated in a repo, it's better to have the source that generated it. In [[Deploying Digital Garden on Independent Vault]] you can find the commands to deploy manually using this workflow.

*My Second Workflow* (current):  One possible solution would be to write my own plugin that copies the pages and attachments to publish to that repo in the same fashion of [[#Option 1 Digital Garden]], so that I keep my vault separate, and this is what I ended up doing, check [eulersson/obsidian-github-exporter](https://github.com/eulersson/obsidian-github-exporter). That way I don't have to deal with local commands on terminals. I can just use Obsidian actions:
- GitHub Exporter: Copy Published URL
- GitHub Exporter: Publish Sync to GitHub
- GitHub Exporter: Toggle Publish Property
- GitHub Exporter: Publish Current File to GitHub

> [!CAUTION] Caution
> The plugin has been written with a lot of AI and I have it under quarentine. I am using it for some time and checking stability. I will also need to read it doesn't do anything strange on the code.

I refer you to the read me from [obsidian-github-exporter](https://github.com/eulersson/obsidian-github-exporter) to check the features.

To deploy to to *Cloudflare* follow the guide in [Quartz's documentation](https://quartz.jzhao.xyz/hosting#cloudflare-pages)

*Cloudflare Pages* does not cancel the deployments that are not the most recent as *GitHub Pages* does. Therefore you might end up with many intermediate deployments that need to run before the most recent change. For that you can follow the instructions in:
- [Cloudflare Docs | Delete a project with a high number of deployments](https://developers.cloudflare.com/pages/platform/known-issues/#delete-a-project-with-a-high-number-of-deployments)
- [Cloudflare Docs | Find zone and account IDs](https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/)

To create the right API Token for this task go to *User API Tokens > Create API Token*  and select the preset **Edit Cloudflare Workers**.

## Next Steps
- Fixing timestamps since all articles show the latest commit date.
- General graph view on Home page would be great.
- Add message to console when publishing finished.
- Seeing how to have better social images.
- Replacing the quartz logo.
- Getting a custom theme that reflects my style more.
- Write README on the **obsidian-github-exporter** after the quarentine has finished.
- Write a post about my workflow.
- Cancel previous running actions if you dispatch the publish action before the current hasn't finished.
- Make the graph text bigger.
- Highlighted text with ==Latin text== works well but not with ==བོད་སྐད་== text.
- Publish anything in attachments that is being referenced from markdown.
- The text in the og:image preview that shows when you share this in WhatsApp to show Tibetan text correctly. Maybe the font for that can be configured.