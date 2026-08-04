# クラウド化 対応メモ (続きはここから)

## 今回の目的
ブラウザの「Cookieとサイトデータ削除」でタスクが全部消えた事件がきっかけで、
localStorageだけでなくクラウド(Firebase)にもバックアップされるようにする対応中。

## これまでにやったこと
- [x] タスク/ルーティンの画像アップロード機能を全削除(UI・処理とも)
- [x] Firebaseプロジェクト作成 (プロジェクトID: `my-data-79773`)
- [x] Firestore Database 作成
- [x] Authentication で Google プロバイダを有効化(サポートメール設定含む)
- [x] Firestore セキュリティルールを設定・公開
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```
- [x] アプリにログイン必須方式を実装(ログインしないとタスク画面が見られない)
  - `authChecked` / `user` / `authError` の状態を app.js に追加
  - ログイン画面・読み込み中スプラッシュを index.html に追加
- [x] Firestore同期処理を実装(`syncFromCloud` / `syncToCloud`)
- [x] GitHub Pages で公開中: https://kokiiiiiiii.github.io/my-todo-app/
  - GitHub リポジトリ: kokiiiiiiii/my-todo-app (mainブランチ)
  - 同じGitHub Pagesドメイン配下に別アプリ `paco` も存在(パスが違うので問題なし)
- [x] Firebase Authentication の「承認済みドメイン」に `kokiiiiiiii.github.io` を追加済み
- [x] ログインエラー `auth/operation-not-allowed` → Google Sign-in方法の有効化不足が原因と判明、対応済み

## 次回続きからやること
- [ ] Google Cloud Console の「OAuth同意画面」で **アプリ名を「Todolist」などに変更**
  - 目的: ログイン時に `my-data-79773.firebaseapp.com` のような分かりにくい表示ではなく、
    アプリ名がはっきり表示されるようにするため
  - アクセス先: https://console.cloud.google.com/apis/credentials/consent
  - 手順:
    1. 画面上部でプロジェクトが `my-data-79773` になっているか確認
    2. 「OAuth 同意画面」の「編集」を開く
    3. 「アプリ名」欄に `Todolist` と入力して保存
  - ※ この手順の途中で迷子になっていたので、次回は画面のスクリーンショットを見ながら進めるとスムーズ
- [ ] アプリ名設定後、実際にGoogleログインが最後まで成功するか確認
- [ ] ログイン後、タスクを追加して Firebase コンソールの Firestore Database →「データ」タブに
      `users/{自分のUID}` というドキュメントが作られ、tasks/routinesが保存されているか確認
- [ ] 別のブラウザ/シークレットモードでも同じGoogleアカウントでログインし、
      同じタスクが復元されるか確認(クラウド同期の最終テスト)

## 参考: 認証まわりの豆知識(このセッションで説明した内容)
- localStorage削除の原因は「Cookieとサイトデータの削除」(操作した時点でアクセスしていた全サイト分が消える)
- Firebase無料枠(Sparkプラン)はクレジットカード不要、個人利用なら容量的にも余裕
- ログイン中にGoogleが一瞬 `my-data-79773.firebaseapp.com` 経由の画面を挟むのは
  Firebase Authの仕様上の正常動作で、独自ドメインを取得しない限り消せない(実害はほぼ無し)
- localStorageは廃止しておらず、オフライン/高速表示用のキャッシュとして残してある設計
